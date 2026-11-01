"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Loader2, Crown, ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { kingdomApi } from "@/lib/kingdom/client";
import { useKingdom } from "@/lib/kingdom/store";
import { COUNTRY_BOARDS } from "@/lib/kingdom/constants";
import { MagicDust } from "./MagicDust";

function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

type AuthMode = "choose" | "phone" | "otp";

/** Molded OTP well — one pressed clay square per digit. */
const OTP_SLOT_CLAY =
  "h-12 w-9 rounded-2xl border-y-0 border-r-0 bg-[#f0e7d3] text-xl font-bold text-foreground shadow-none first:border-l-0 first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:scale-105 data-[active=true]:bg-[#f8f1e2]";

export function SplashScreen() {
  const setSession = useKingdom((s) => s.setSession);
  const [mode, setMode] = useState<AuthMode>("choose");
  const [googleOpen, setGoogleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Google sheet state
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");

  // Phone state
  const [dial, setDial] = useState("+91");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneName, setPhoneName] = useState("");

  const fullPhone = `${dial}${phone.replace(/[^\d]/g, "")}`;

  async function signInGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await kingdomApi.auth.google(gName, gEmail);
      setSession(res.token, res.user);
      toast.success(res.isNew ? "Welcome to the Kingdom! ✦" : `Welcome back, ${res.user.name}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 8) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await kingdomApi.auth.otpSend(fullPhone);
      setMode("otp");
      toast.info(`Demo SMS gateway — your OTP is ${res.devCode}`, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await kingdomApi.auth.otpVerify(fullPhone, otp, phoneName || undefined);
      setSession(res.token, res.user);
      toast.success(res.isNew ? "Welcome to the Kingdom! ✦" : `Welcome back, ${res.user.name}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kingdom-bg relative flex min-h-dvh flex-col items-center overflow-hidden px-6">
      <MagicDust count={16} />

      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="mt-14 flex flex-col items-center gap-2"
      >
        <div className="relative">
          <div className="clay-well flex h-12 w-12 items-center justify-center">
            <Crown className="h-6 w-6 text-lavender" strokeWidth={1.6} />
          </div>
          <span className="sparkle absolute -right-2 -top-1 text-[10px] text-lavender">✦</span>
        </div>
        <div className="font-display text-2xl font-bold tracking-wide">
          <span className="text-foreground">Scholar</span> <span className="lavender-text">Kingdom</span>
        </div>
      </motion.div>

      {/* Hero art */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative mt-6 flex w-full max-w-[340px] flex-1 items-center justify-center"
      >
        <div className="relative">
          <div
            className="clay-well absolute -bottom-3 left-1/2 h-10 w-44 -translate-x-1/2 opacity-70"
            style={{ borderRadius: "999px" }}
          />
          <Image
            src="/kingdom/castle-hero-clay.png"
            alt="A hand-molded claymation castle with gold coins at its base"
            width={380}
            height={507}
            priority
            className="animate-float-slow relative block select-none rounded-[2rem]"
          />
        </div>
      </motion.div>

      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35 }}
        className="flex w-full max-w-sm flex-col items-center text-center"
      >
        <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.08] text-foreground">
          A world of learning,
          <br />
          <span className="lavender-text">yours to build.</span>
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Your personal AI tutor for <span className="text-lavender">every curriculum on Earth</span> — Grades 6–12.
          Study, earn Kingdom Coins &amp; claim real land on the world map.
        </p>
      </motion.div>

      {/* Auth */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        className="mb-8 mt-8 w-full max-w-sm"
      >
        <AnimatePresence mode="wait">
          {mode === "choose" && (
            <motion.div
              key="choose"
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex flex-col gap-3"
            >
              <button
                onClick={() => setGoogleOpen(true)}
                className="ghost-btn flex h-13 w-full items-center justify-center gap-3 rounded-full py-3.5 text-[15px] font-semibold"
              >
                <GoogleG className="h-5 w-5" />
                Continue with Google
              </button>
              <button
                onClick={() => setMode("phone")}
                className="glow-btn flex h-13 w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-[15px] font-semibold"
              >
                <Phone className="h-4.5 w-4.5" />
                Continue with Phone
              </button>
            </motion.div>
          )}

          {mode === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              className="clay flex flex-col gap-4 p-6"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-lavender">
                  ← Back
                </button>
                <span className="text-xs font-medium text-muted-foreground">Phone sign-in</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={dial}
                  onChange={(e) => setDial(e.target.value)}
                  className="h-12 shrink-0 rounded-2xl border-0 bg-input px-3.5 text-sm font-semibold text-foreground outline-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                  style={{ boxShadow: "var(--clay-press)" }}
                  aria-label="Country calling code"
                >
                  {COUNTRY_BOARDS.map((c) => (
                    <option key={c.country} value={c.dialCode}>
                      {c.flag} {c.dialCode}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 flex-1 rounded-2xl border-0 bg-input px-4 text-base tracking-wide shadow-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                  style={{ boxShadow: "var(--clay-press)" }}
                />
              </div>
              <Input
                placeholder="Your name (optional)"
                value={phoneName}
                onChange={(e) => setPhoneName(e.target.value)}
                className="h-12 rounded-2xl border-0 bg-input px-4 shadow-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                style={{ boxShadow: "var(--clay-press)" }}
              />
              <Button onClick={sendOtp} disabled={busy} className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
                We&apos;ll text you a 6-digit code to keep your kingdom secure.
              </p>
            </motion.div>
          )}

          {mode === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              className="clay flex flex-col items-center gap-4 p-6"
            >
              <div className="flex w-full items-center justify-between">
                <button onClick={() => setMode("phone")} className="text-xs text-muted-foreground hover:text-lavender">
                  ← Back
                </button>
                <span className="text-xs font-medium text-lavender">Code sent to {fullPhone}</span>
              </div>
              <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                <InputOTPGroup className="gap-1">
                  <InputOTPSlot index={0} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                  <InputOTPSlot index={1} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                  <InputOTPSlot index={2} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                </InputOTPGroup>
                <InputOTPSeparator className="text-muted-foreground [&_svg]:size-3" />
                <InputOTPGroup className="gap-1">
                  <InputOTPSlot index={3} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                  <InputOTPSlot index={4} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                  <InputOTPSlot index={5} className={OTP_SLOT_CLAY} style={{ boxShadow: "var(--clay-press)" }} />
                </InputOTPGroup>
              </InputOTP>
              <Button
                onClick={verifyOtp}
                disabled={busy || otp.length !== 6}
                className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify &amp; Enter the Kingdom <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <button onClick={sendOtp} className="text-xs text-muted-foreground underline-offset-2 hover:text-lavender hover:underline">
                Resend code
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/60">
          For scholars aged 11–18 (Grades 6–12) only. By continuing you accept the{" "}
          <span className="text-primary underline underline-offset-2">Terms</span> and{" "}
          <span className="text-primary underline underline-offset-2">Privacy Policy</span>.
        </p>
      </motion.div>

      {/* Google account chooser sheet (styled like the real one) */}
      <Dialog open={googleOpen} onOpenChange={setGoogleOpen}>
        <DialogContent className="clay max-w-sm rounded-[1.75rem] border-0 p-0 text-foreground sm:max-w-sm sm:rounded-[1.75rem]">
          <div className="flex flex-col items-center px-6 pb-6 pt-8">
            <GoogleG className="h-9 w-9" />
            <DialogHeader className="mt-4 text-center">
              <DialogTitle className="text-center text-xl font-normal text-foreground">
                Sign in <span className="font-medium">with Google</span> to continue to{" "}
                <span className="font-medium text-primary">Scholar&apos;s Kingdom</span>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-6 w-full space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Your name"
                  className="h-12 w-full rounded-2xl border-0 bg-input pl-10 pr-4 text-[15px] text-foreground outline-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                  style={{ boxShadow: "var(--clay-press)" }}
                />
              </div>
              <div className="relative">
                <GoogleG className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  placeholder="your.name@gmail.com"
                  inputMode="email"
                  className="h-12 w-full rounded-2xl border-0 bg-input pl-10 pr-4 text-[15px] text-foreground outline-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                  style={{ boxShadow: "var(--clay-press)" }}
                />
              </div>
              <button
                onClick={signInGoogle}
                disabled={busy}
                className="glow-btn flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              </button>
            </div>

            <div className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              <p>
                Your Google account is used only to create your kingdom profile. In production this flow uses Google OAuth;
                this build provisions the account server-side.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
