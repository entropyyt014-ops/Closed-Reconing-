// ─── Scholar's Kingdom: server-side Gemini engine wrapper ──────────────────
// All z-ai-web-dev-sdk usage stays on the server (never client-side).

import ZAI from "z-ai-web-dev-sdk";

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;

let zaiInstance: ZAIInstance | null = null;

export async function getZAI(): Promise<ZAIInstance> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── Gentle global throttle: keep ~700ms between LLM calls to dodge 429s ────
let lastCallAt = 0;
let throttleChain: Promise<void> = Promise.resolve();
const MIN_INTERVAL_MS = 700;

async function throttleAI(): Promise<void> {
  const run = async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  };
  throttleChain = throttleChain.then(run, run);
  await throttleChain;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Plain chat completion (thinking disabled for speed). */
export async function aiChat(messages: AIMessage[]): Promise<string> {
  const zai = await getZAI();
  await throttleAI();
  const completion = await zai.chat.completions.create({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error("Empty response from AI");
  }
  return content.trim();
}

/** Extract the first JSON object/array from a model response. */
function extractJSON(raw: string): unknown {
  let text = raw.trim();
  // strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // direct parse attempt
  try {
    return JSON.parse(text);
  } catch {
    /* keep digging */
  }
  // find first { or [ and matching last } or ]
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  let start = -1;
  let end = -1;
  if (firstObj === -1 && firstArr === -1) throw new Error("No JSON found in response");
  if (firstArr === -1 || (firstObj !== -1 && firstObj < firstArr)) {
    start = firstObj;
    end = text.lastIndexOf("}");
  } else {
    start = firstArr;
    end = text.lastIndexOf("]");
  }
  if (start === -1 || end === -1 || end <= start) throw new Error("Malformed JSON in response");
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

/**
 * Ask the model for a strict JSON payload and parse it safely,
 * retrying once with a repair instruction if parsing fails.
 */
export async function aiJSON<T>(
  system: string,
  user: string,
  attempts = 3
): Promise<T> {
  const zai = await getZAI();
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      // backoff before retry — longer if the API is rate-limiting us
      const isRateLimit = String(lastError).toLowerCase().includes("429") || String(lastError).toLowerCase().includes("too many");
      await sleep(isRateLimit ? 3000 : 1500);
    }
    const repairNote =
      i > 0
        ? "\n\nIMPORTANT: Your previous answer was not valid JSON. Reply with ONLY the raw JSON object, no prose, no markdown fences."
        : "";
    await throttleAI();
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user + repairNote },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      try {
        return extractJSON(raw) as T;
      } catch (err) {
        lastError = err;
      }
    } catch (err) {
      lastError = err; // API-level failure (e.g. 429) → retry with backoff
    }
  }
  throw new Error(`AI JSON parsing failed: ${String(lastError)}`);
}

/** Vision analysis of an image (base64 data URL) — used by the tutor for homework photos. */
export async function aiVision(
  imageDataUrl: string,
  prompt: string,
  context?: AIMessage[]
): Promise<string> {
  const zai = await getZAI();
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];
  let fullPrompt = prompt;
  if (context && context.length > 0) {
    const history = context
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
      .join("\n");
    fullPrompt = `${prompt}\n\nConversation so far:\n${history}`;
  }
  content.push({ type: "text", text: fullPrompt });
  content.push({
    type: "image_url",
    image_url: { url: imageDataUrl },
  });
  // NOTE: the SDK type requires `model`, but the vision endpoint defaults it
  // server-side (same behaviour as the z-ai CLI) — cast to keep CLI parity.
  const body = {
    messages: [{ role: "user", content }],
    thinking: { type: "disabled" },
  } as unknown as Parameters<ZAIInstance["chat"]["completions"]["createVision"]>[0];
  const response = await zai.chat.completions.createVision(body);
  return response.choices[0]?.message?.content?.trim() ?? "";
}
