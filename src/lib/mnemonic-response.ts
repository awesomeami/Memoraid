import type { MnemonicDetails } from "../types";

function isDetails(value: unknown): value is MnemonicDetails {
  if (!value || typeof value !== "object") return false;
  const data = value as MnemonicDetails;
  return typeof data.mnemonic === "string" && data.mnemonic.trim().length > 0 &&
    typeof data.strategyUsed === "string" &&
    Number.isInteger(data.memorabilityScore) && data.memorabilityScore >= 1 && data.memorabilityScore <= 10 &&
    (data.whyItWorks === undefined || typeof data.whyItWorks === "string") &&
    Array.isArray(data.expansion) && data.expansion.length > 0 &&
    data.expansion.every(item => item && typeof item.letter === "string" && typeof item.concept === "string" &&
      (item.details === undefined || typeof item.details === "string"));
}

/** Validate new model responses before they can enter history or crash a card. */
export function parseMnemonicResponse(text: string) {
  const result = JSON.parse(text.trim());
  if (!result || !isDetails(result.bestMnemonic) || !Array.isArray(result.alternativeMnemonics) ||
      result.alternativeMnemonics.length !== 1 || !result.alternativeMnemonics.every(isDetails)) {
    throw new Error("The AI returned an incomplete study guide. Please try again.");
  }
  return result as { bestMnemonic: MnemonicDetails; alternativeMnemonics: MnemonicDetails[] };
}
