export const MAX_MEDICAL_TEXT_LENGTH = 4000;

export const DEFAULT_MODEL = "gemini-3.6-flash";
export const LITE_MODEL = "gemini-3.1-flash-lite";
export const PRO_MODEL = "gemini-3.1-pro-preview";

export interface MnemonicExpansionItem {
  letter: string;
  concept: string;
  details?: string;
  rowId?: string;
}

export interface MnemonicDetails {
  mnemonic: string;
  strategyUsed: string;
  expansion: MnemonicExpansionItem[];
  whyItWorks?: string;
  memorabilityScore: number;
}

export interface MnemonicResult {
  id: string;
  timestamp: number;
  medicalText: string;
  specialty: string;
  mnemonicStyle: string;
  bestMnemonic: MnemonicDetails;
  alternativeMnemonics: MnemonicDetails[];
  isFavorite?: boolean;
  isPinned?: boolean;
}

export type ActiveTab = "generate" | "history" | "favorites" | "settings";

export const MEDICAL_SPECIALTIES = [
  "Anatomy",
  "Physiology",
  "Biochemistry",
  "Pathology",
  "Pharmacology",
  "Microbiology",
  "Internal Medicine",
  "Pediatrics",
  "Surgery",
  "Obstetrics & Gynecology",
  "Psychiatry",
  "Cardiology",
  "Neurology",
  "Emergency Medicine",
  "Anesthesiology",
  "Dermatology",
  "General Medical Fact"
];

export const MNEMONIC_STYLES = [
  { value: "Any", label: "Auto-Detect Best Cognitive Strategy" },
  { value: "English Word Acronym", label: "English Word Acronym (Priority 1)" },
  { value: "Pronounceable Pseudo-word", label: "Pronounceable Pseudo-word (Priority 2)" },
  { value: "Vivid Visual Story", label: "Vivid Imagery & Storytelling" },
  { value: "Anatomical Metaphor", label: "Anatomical & Spatial Metaphors" }
];
