// ─── Scholar's Kingdom: global curriculum constants ────────────────────────

export const GRADES = [6, 7, 8, 9, 10, 11, 12] as const;

export function gradeLabel(grade: number): string {
  if (grade <= 8) return `Grade ${grade} · Middle School`;
  return `Grade ${grade} · High School`;
}

export interface CountryBoards {
  country: string;
  flag: string;
  dialCode: string;
  boards: string[];
}

export const COUNTRY_BOARDS: CountryBoards[] = [
  {
    country: "India",
    flag: "🇮🇳",
    dialCode: "+91",
    boards: ["CBSE", "ICSE", "IB MYP", "IB Diploma", "Cambridge IGCSE", "State Board"],
  },
  {
    country: "United Kingdom",
    flag: "🇬🇧",
    dialCode: "+44",
    boards: ["National Curriculum (KS3/KS4)", "AQA GCSE", "Edexcel GCSE", "OCR GCSE", "A-Levels"],
  },
  {
    country: "United States",
    flag: "🇺🇸",
    dialCode: "+1",
    boards: ["Common Core", "AP (College Board)", "IB MYP", "IB Diploma", "State Standards"],
  },
  {
    country: "Australia",
    flag: "🇦🇺",
    dialCode: "+61",
    boards: ["Australian Curriculum (ACARA)", "HSC (NSW)", "VCE (Victoria)", "IB Diploma"],
  },
  {
    country: "Singapore",
    flag: "🇸🇬",
    dialCode: "+65",
    boards: ["MOE Secondary", "Cambridge O-Level", "IB Diploma"],
  },
  {
    country: "United Arab Emirates",
    flag: "🇦🇪",
    dialCode: "+971",
    boards: ["CBSE (UAE)", "British Curriculum (IGCSE)", "American Curriculum", "IB Diploma"],
  },
  {
    country: "Canada",
    flag: "🇨🇦",
    dialCode: "+1",
    boards: ["Ontario Curriculum", "IB Diploma", "Provincial Standards"],
  },
  {
    country: "Germany",
    flag: "🇩🇪",
    dialCode: "+49",
    boards: ["German Gymnasium", "IB Diploma"],
  },
  {
    country: "Japan",
    flag: "🇯🇵",
    dialCode: "+81",
    boards: ["Japanese National Curriculum", "IB Diploma"],
  },
  {
    country: "Brazil",
    flag: "🇧🇷",
    dialCode: "+55",
    boards: ["BNCC (Base Nacional Comum)", "IB Diploma"],
  },
  {
    country: "South Africa",
    flag: "🇿🇦",
    dialCode: "+27",
    boards: ["CAPS (National Curriculum)", "IEB", "Cambridge IGCSE"],
  },
  {
    country: "Global / Other",
    flag: "🌍",
    dialCode: "+1",
    boards: ["IB MYP", "IB Diploma", "Cambridge IGCSE", "National Curriculum"],
  },
];

export const SUBJECTS = [
  "Mathematics",
  "Science",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Business Studies",
  "Accountancy",
  "Environmental Science",
  "Civics / Political Science",
  "Second Language",
  "Psychology",
  "Sociology",
  "Statistics",
];

// ─── Gamification economy ──────────────────────────────────────────────────

export const REWARDS = {
  SIGNUP: 50,
  CHAPTER_COMPLETE: 25,
  NOTE_MODULE_COMPLETE: 10,
  TEST_PASS_BASE: 30, // scaled by score
} as const;

export function territoryRadiusM(coins: number): number {
  // 1 coin = 1 m² → circle of area = coins → r = sqrt(coins / π)
  return Math.sqrt(Math.max(coins, 0) / Math.PI);
}

export function formatTerritory(coins: number): string {
  if (coins >= 1_000_000) return `${(coins / 1_000_000).toFixed(1)}M m²`;
  if (coins >= 10_000) return `${(coins / 1000).toFixed(1)}K m²`;
  return `${coins.toLocaleString()} m²`;
}
