// ─── Scholar's Kingdom: shared types across app & API ──────────────────────

export interface KingdomUser {
  id: string;
  name: string;
  kingdomName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  grade: number | null;
  board: string | null;
  subjects: string[];
  coins: number;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  onboarded: boolean;
  avatarSeed: string;
  createdAt: string;
}

export interface SessionPayload {
  token: string;
  user: KingdomUser;
}

export interface Chapter {
  id: number;
  title: string;
  topics: string[];
  estimatedHours: number;
}

export interface Syllabus {
  subject: string;
  chapters: Chapter[];
}

export interface DeepDiveSection {
  topic: string;
  explanation: string;
}

export interface FormulaItem {
  name: string;
  expression: string;
  note: string;
}

export interface ChapterModule {
  summary: string;
  deepDive: DeepDiveSection[];
  formulas: FormulaItem[];
  revisionPoints: string[];
  pyqInsight: string;
}

export type QuestionType = "mcq" | "short" | "long" | "case";

export interface TestQuestion {
  id: number;
  type: QuestionType;
  context?: string;
  text: string;
  options?: string[];
  correctIndex?: number;
  marks: number;
  competency: string;
  answerHint?: string;
  markingScheme?: string;
}

export interface TestSection {
  name: string;
  instructions: string;
  questions: TestQuestion[];
}

export interface TestPaper {
  paperTitle: string;
  instructions: string;
  totalMarks: number;
  durationMins: number;
  pyqPattern: string;
  sections: TestSection[];
}

export interface QuestionResult {
  id: number;
  scored: number;
  feedback: string;
}

export interface TestResult {
  totalScored: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  perQuestion: QuestionResult[];
  strengths: string[];
  weakAreas: string[];
  studyAdvice: string;
  coinReward: number;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface TapReveal {
  term: string;
  definition: string;
}

export interface MiniQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ConceptFlow {
  title: string;
  nodes: string[];
}

export interface InteractiveBlocks {
  flashcards: Flashcard[];
  tapReveal: TapReveal[];
  quiz: MiniQuizQuestion[];
  flow: ConceptFlow | null;
}

export interface NoteDTO {
  id: string;
  subject: string;
  chapter: string;
  title: string;
  content: string;
  blocks: InteractiveBlocks | null;
  coinsEarned: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestAttemptDTO {
  id: string;
  subject: string;
  chapter: string;
  paper: TestPaper | null;
  result: TestResult | null;
  status: "draft" | "submitted";
  coinsEarned: number;
  createdAt: string;
  submittedAt: string | null;
}

export interface ChapterProgressDTO {
  subject: string;
  chapterTitle: string;
  status: "in_progress" | "completed";
  coinsEarned: number;
  completedAt: string | null;
}

export interface KingdomMarker {
  id: string;
  name: string;
  kingdomName: string;
  coins: number;
  lat: number;
  lng: number;
  country: string | null;
  grade: number | null;
  board: string | null;
  isMe: boolean;
  isDemo: boolean;
  territoryRadiusM: number;
}

export interface CoinLedgerEntry {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}
