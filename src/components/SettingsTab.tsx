import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Key, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  ExternalLink, 
  Sparkles, 
  Trash2, 
  Check, 
  AlertTriangle,
  RefreshCw 
} from "lucide-react";
import { User } from "../lib/firebase";
import { DEFAULT_MODEL } from "../types";

interface SettingsTabProps {
  currentUser: User | null;
  onKeysChanged?: () => void;
  selectedModel?: string;
}

export default function SettingsTab({ currentUser, onKeysChanged, selectedModel }: SettingsTabProps) {
  // Initialize with 5 empty slots
  const [keys, setKeys] = useState<string[]>(["", "", "", "", ""]);
  const [savedKeys, setSavedKeys] = useState<string[]>(["", "", "", "", ""]);
  const [showKeys, setShowKeys] = useState<boolean[]>([false, false, false, false, false]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [confirmClearIdx, setConfirmClearIdx] = useState<number | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);
  const [testAllResult, setTestAllResult] = useState<string | null>(null);
  
  // Validation states per slot
  const [validationStates, setValidationStates] = useState<("idle" | "validating" | "valid" | "invalid")[]>(
    ["idle", "idle", "idle", "idle", "idle"]
  );
  const [slotErrors, setSlotErrors] = useState<(string | null)[]>([null, null, null, null, null]);
  const [slotWarnings, setSlotWarnings] = useState<(string | null)[]>([null, null, null, null, null]);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Load keys & active index on mount or when currentUser changes
  useEffect(() => {
    setSlotWarnings([null, null, null, null, null]);
    const uid = currentUser?.uid || "guest";
    const keysStorageKey = `medmnemonic_gemini_keys::${uid}`;
    const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;

    // Migration logic: check if old un-namespaced value exists, and if so, migrate it to the current user's namespaced key, then remove it.
    const oldKeysRaw = localStorage.getItem("medmnemonic_user_gemini_keys");
    if (oldKeysRaw) {
      localStorage.setItem(keysStorageKey, oldKeysRaw);
      localStorage.removeItem("medmnemonic_user_gemini_keys");
      
      const oldIdxRaw = localStorage.getItem("medmnemonic_user_gemini_key_index");
      if (oldIdxRaw) {
        localStorage.setItem(indexStorageKey, oldIdxRaw);
        localStorage.removeItem("medmnemonic_user_gemini_key_index");
      }
    }

    const keysRaw = localStorage.getItem(keysStorageKey);
    let initialKeys = ["", "", "", "", ""];
    if (keysRaw) {
      try {
        const parsed = JSON.parse(keysRaw);
        if (Array.isArray(parsed)) {
          initialKeys = [...parsed, "", "", "", "", ""].slice(0, 5).map(k => typeof k === "string" ? k.trim() : "");
        }
      } catch (e) {
        console.error("Failed to parse saved keys on mount:", e);
      }
    } else {
      // Migrate legacy single key
      const oldKey = localStorage.getItem("medmnemonic_user_gemini_key");
      if (oldKey && oldKey.trim()) {
        initialKeys[0] = oldKey.trim();
        localStorage.setItem(keysStorageKey, JSON.stringify(initialKeys));
        localStorage.removeItem("medmnemonic_user_gemini_key");
      }
    }
    setKeys(initialKeys);
    setSavedKeys(initialKeys);

    // Set initial validation states for saved keys
    const initialValidation = initialKeys.map(k => k ? "valid" : "idle") as ("idle" | "validating" | "valid" | "invalid")[];
    setValidationStates(initialValidation);

    // 2. Load active starting index
    const idxRaw = localStorage.getItem(indexStorageKey);
    let initialIdx = 0;
    if (idxRaw) {
      const parsedIdx = parseInt(idxRaw, 10);
      if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < 5) {
        initialIdx = parsedIdx;
      }
    }
    setActiveIdx(initialIdx);
  }, [currentUser]);

  // Validate helper that returns boolean
  const validateSlot = async (slotIdx: number, keyToValidate: string): Promise<boolean> => {
    // Check for duplicates in other slots
    const duplicateIdx = keys.findIndex((k, idx) => idx !== slotIdx && k.trim() !== "" && k.trim() === keyToValidate);
    if (duplicateIdx !== -1) {
      setSlotErrors(prev => {
        const updated = [...prev];
        updated[slotIdx] = `This key is already saved in Slot ${duplicateIdx + 1} — rotation won't help if two slots share the same key.`;
        return updated;
      });
      setValidationStates(prev => {
        const updated = [...prev];
        updated[slotIdx] = "invalid";
        return updated;
      });
      return false;
    }

    // Set validating status
    setValidationStates(prev => {
      const updated = [...prev];
      updated[slotIdx] = "validating";
      return updated;
    });
    setSlotErrors(prev => {
      const updated = [...prev];
      updated[slotIdx] = null;
      return updated;
    });

    try {
      // Get user Auth token if logged in
      let idToken = "";
      if (currentUser) {
        idToken = await currentUser.getIdToken();
      }

      // Test validate API call
      const response = await fetch("/api/mnemonic/validate-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : "",
          "X-User-Gemini-Key": keyToValidate,
        },
        body: JSON.stringify({
          modelToValidate: selectedModel || DEFAULT_MODEL
        })
      });

      let data: any;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error(`Server returned an unexpected non-JSON response (${response.status}). This may be due to a temporary server startup or gateway issue. Please try again in a moment.`);
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || "Failed to validate API Key.");
      }
      setSlotWarnings(prev => prev.map((warning, idx) => idx === slotIdx ? data.warning || null : warning));

      const uid = currentUser?.uid || "guest";
      const keysStorageKey = `medmnemonic_gemini_keys::${uid}`;
      const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;

      // If valid, save the array
      setSavedKeys(prev => {
        const updated = [...prev];
        updated[slotIdx] = keyToValidate;
        localStorage.setItem(keysStorageKey, JSON.stringify(updated));
        return updated;
      });
      setKeys(prev => {
        const updated = [...prev];
        updated[slotIdx] = keyToValidate;
        return updated;
      });

      // Set validation state
      setValidationStates(prev => {
        const updated = [...prev];
        updated[slotIdx] = "valid";
        return updated;
      });

      // Automatically set this slot as active if it's the first working slot or active index is empty
      const currentActiveKey = savedKeys[activeIdx];
      if (!currentActiveKey || currentActiveKey.trim() === "") {
        localStorage.setItem(indexStorageKey, String(slotIdx));
        setActiveIdx(slotIdx);
      }

      if (onKeysChanged) onKeysChanged();
      return true;

    } catch (err: any) {
      console.error(`Validation failed for slot ${slotIdx + 1}:`, err);
      setValidationStates(prev => {
        const updated = [...prev];
        updated[slotIdx] = "invalid";
        return updated;
      });
      setSlotErrors(prev => {
        const updated = [...prev];
        updated[slotIdx] = err.message || "Invalid API key. Please check AI Studio settings.";
        return updated;
      });
      return false;
    }
  };

  // Validate and Save a single slot
  const handleValidateAndSaveSlot = async (slotIdx: number) => {
    const keyToValidate = keys[slotIdx].trim();
    if (!keyToValidate) {
      setSlotErrors(prev => {
        const updated = [...prev];
        updated[slotIdx] = "Key cannot be empty.";
        return updated;
      });
      return;
    }

    setGlobalSuccess(null);
    const isValid = await validateSlot(slotIdx, keyToValidate);
    if (isValid) {
      setGlobalSuccess(`Slot ${slotIdx + 1} validated and saved successfully!`);
      setTimeout(() => setGlobalSuccess(null), 3000);
    }
  };

  // Test all saved keys sequentially
  const handleTestAllKeys = async () => {
    setIsTestingAll(true);
    setTestAllResult(null);
    setGlobalSuccess(null);

    // Identify indices of currently saved keys
    const savedIndices: number[] = [];
    savedKeys.forEach((key, idx) => {
      if (key && key.trim()) {
        savedIndices.push(idx);
      }
    });

    if (savedIndices.length === 0) {
      setTestAllResult("No saved keys to validate.");
      setIsTestingAll(false);
      return;
    }

    let validCount = 0;
    for (const idx of savedIndices) {
      const isValid = await validateSlot(idx, savedKeys[idx].trim());
      if (isValid) {
        validCount++;
      }
    }

    setTestAllResult(`${validCount} of ${savedIndices.length} keys valid`);
    setIsTestingAll(false);

    // Automatically clear the test result after some time
    setTimeout(() => setTestAllResult(null), 5000);
  };

  // Clear/remove key from slot
  const handleClearSlot = (slotIdx: number) => {
    setSlotWarnings(prev => prev.map((warning, idx) => idx === slotIdx ? null : warning));
    const uid = currentUser?.uid || "guest";
    const keysStorageKey = `medmnemonic_gemini_keys::${uid}`;
    const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;

    const updatedKeys = [...savedKeys];
    updatedKeys[slotIdx] = "";

    localStorage.setItem(keysStorageKey, JSON.stringify(updatedKeys));
    setSavedKeys(updatedKeys);
    
    setKeys(prev => {
      const updated = [...prev];
      updated[slotIdx] = "";
      return updated;
    });

    setValidationStates(prev => {
      const updated = [...prev];
      updated[slotIdx] = "idle";
      return updated;
    });

    setSlotErrors(prev => {
      const updated = [...prev];
      updated[slotIdx] = null;
      return updated;
    });

    // If the cleared slot was the active slot, auto-select the next available key as active
    if (activeIdx === slotIdx) {
      const nextAvailableIdx = updatedKeys.findIndex(k => k && k.trim() !== "");
      const newActive = nextAvailableIdx !== -1 ? nextAvailableIdx : 0;
      localStorage.setItem(indexStorageKey, String(newActive));
      setActiveIdx(newActive);
    }

    setGlobalSuccess(`Slot ${slotIdx + 1} cleared.`);
    if (onKeysChanged) onKeysChanged();
    setTimeout(() => setGlobalSuccess(null), 3000);
  };

  const handleClearAllKeys = () => {
    setSlotWarnings([null, null, null, null, null]);
    const uid = currentUser?.uid || "guest";
    const keysStorageKey = `medmnemonic_gemini_keys::${uid}`;
    const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;

    const clearedKeys = ["", "", "", "", ""];
    localStorage.setItem(keysStorageKey, JSON.stringify(clearedKeys));
    localStorage.setItem(indexStorageKey, "0");

    setSavedKeys(clearedKeys);
    setKeys(clearedKeys);
    setActiveIdx(0);
    setConfirmClearAll(false);
    setConfirmClearIdx(null);

    // Reset validation & error states
    setValidationStates(["idle", "idle", "idle", "idle", "idle"]);
    setSlotErrors([null, null, null, null, null]);

    setGlobalSuccess("All Gemini API keys cleared successfully.");
    if (onKeysChanged) onKeysChanged();
    setTimeout(() => setGlobalSuccess(null), 3000);
  };

  // Set starter/active starting slot manually
  const handleSetActiveSlot = (slotIdx: number) => {
    if (!savedKeys[slotIdx]) return; // Cannot set an empty slot as active
    const uid = currentUser?.uid || "guest";
    const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;

    localStorage.setItem(indexStorageKey, String(slotIdx));
    setActiveIdx(slotIdx);
    if (onKeysChanged) onKeysChanged();
    setGlobalSuccess(`Slot ${slotIdx + 1} set as active starting key.`);
    setTimeout(() => setGlobalSuccess(null), 3000);
  };

  const toggleShowKey = (slotIdx: number) => {
    setShowKeys(prev => {
      const updated = [...prev];
      updated[slotIdx] = !updated[slotIdx];
      return updated;
    });
  };

  const totalConfiguredKeys = savedKeys.filter(k => k && k.trim() !== "").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-3xl"
    >
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Gemini Multi-Key Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Configure up to 5 keys. The app rotates keys automatically to bypass rate limits (429 errors).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {totalConfiguredKeys > 0 && (
              <button
                type="button"
                disabled={isTestingAll}
                onClick={handleTestAllKeys}
                className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50/25 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-950/20 dark:bg-blue-950/15 dark:text-blue-400 dark:hover:bg-blue-950/35 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingAll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" /> Test All Keys
                  </>
                )}
              </button>
            )}
            {testAllResult && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/30">
                {testAllResult}
              </span>
            )}
            {totalConfiguredKeys > 0 && (
              <div className="flex items-center">
                {confirmClearAll ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-red-50/50 p-1 dark:bg-red-950/20 border border-red-100 dark:border-red-950/30">
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 px-1">Clear All?</span>
                    <button
                      type="button"
                      onClick={handleClearAllKeys}
                      className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50/20 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-950/20 dark:bg-red-950/10 dark:text-red-400 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear All Keys
                  </button>
                )}
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-zinc-900 dark:text-zinc-300">
              {totalConfiguredKeys} / 5 Keys Configured
            </span>
          </div>
        </div>

        {/* Informational Callout */}
        <div className="mb-6 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300">
          <p className="font-semibold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Key Safety &amp; Multi-Key Rotation:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Each key is <strong>stored only in your browser's localStorage</strong> and is never logged or persisted on the server.</li>
            <li>Keys are sent to the app's backend via request headers only at the moment of generation or validation, purely to call Google's Gemini API on your behalf.</li>
            <li>If a key hits a <strong>429 / RESOURCE_EXHAUSTED</strong> error, the app automatically rotates and retries with the next saved backup key.</li>
            <li>Gemini rate limits are tied to the Google Cloud project; rotation is most effective when slots utilize keys from separate accounts or projects.</li>
          </ul>
        </div>

        {/* Device Sync Disclaimer */}
        <div className="mb-6 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800/40">
          <p className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Storage &amp; Sync Disclaimer:
          </p>
          <p>
            Your API keys are stored only in this browser's local storage. They do not sync across devices, even when signed in with Google — you'll need to re-enter them on each new device or browser.
          </p>
        </div>

        {/* Project Rate Limit Alert */}
        <div className="mb-6 rounded-2xl bg-amber-50/50 p-4 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/10 dark:text-amber-300 border border-amber-100/30 dark:border-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Rate Limiting Notice:
          </p>
          <p>
            Gemini API rate limits are enforced per Google Cloud project, not per individual API key. Rotating across slots only helps if each key originates from a genuinely separate Google account or Google Cloud project.
          </p>
        </div>

        {globalSuccess && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2.5 text-xs font-semibold text-green-700 border border-green-100 dark:bg-green-950/10 dark:text-green-400 dark:border-green-950/30">
            <Check className="h-4 w-4" />
            {globalSuccess}
          </div>
        )}

        {/* Key Slots List */}
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, idx) => {
            const isSaved = !!savedKeys[idx];
            const isActive = activeIdx === idx && isSaved;
            const valState = validationStates[idx];
            const error = slotErrors[idx];
            const keyVal = keys[idx];
            const hasChanged = keyVal !== savedKeys[idx];

            return (
              <div 
                key={idx} 
                className={`rounded-2xl border p-4 transition-all ${
                  isActive 
                    ? "border-blue-500 bg-blue-50/5 dark:border-blue-500/50 dark:bg-blue-950/5" 
                    : "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/20"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 dark:text-zinc-500">
                      Slot {idx + 1}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                        Starting Key
                      </span>
                    )}
                    {isSaved && !isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                        Backup Key
                      </span>
                    )}
                    {!isSaved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-zinc-800/40 dark:text-zinc-600">
                        Empty Slot
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href="https://aistudio.google.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex items-center gap-0.5"
                    >
                      Get Key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 rounded-xl border border-slate-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
                    <input
                      type={showKeys[idx] ? "text" : "password"}
                      placeholder="AIzaSy... (Paste Gemini API key here)"
                      value={keyVal}
                      onChange={(e) => {
                        setSlotWarnings(prev => prev.map((warning, index) => index === idx ? null : warning));
                        setKeys(prev => {
                          const updated = [...prev];
                          updated[idx] = e.target.value;
                          return updated;
                        });
                        if (validationStates[idx] !== "idle") {
                          setValidationStates(prev => {
                            const updated = [...prev];
                            updated[idx] = "idle";
                            return updated;
                          });
                        }
                        if (slotErrors[idx]) {
                          setSlotErrors(prev => {
                            const updated = [...prev];
                            updated[idx] = null;
                            return updated;
                          });
                        }
                      }}
                      disabled={valState === "validating"}
                      className="w-full bg-transparent px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-300 dark:placeholder:text-zinc-700 outline-none pr-10"
                    />
                    {keyVal && (
                      <button
                        type="button"
                        onClick={() => toggleShowKey(idx)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
                        title={showKeys[idx] ? "Hide API Key" : "Show API Key"}
                        aria-label={showKeys[idx] ? "Hide API Key" : "Show API Key"}
                      >
                        {showKeys[idx] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* Slot Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(hasChanged || !isSaved) && keyVal.trim() !== "" && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        onClick={() => handleValidateAndSaveSlot(idx)}
                        disabled={valState === "validating"}
                        className="rounded-xl bg-slate-900 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-zinc-100 transition-all cursor-pointer flex items-center gap-1 font-sans"
                      >
                        {valState === "validating" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Save & Validate"
                        )}
                      </motion.button>
                    )}

                    {isSaved && !hasChanged && !isActive && (
                      <button
                        type="button"
                        onClick={() => handleSetActiveSlot(idx)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                      >
                        Set Active
                      </button>
                    )}

                     {isSaved && (
                      <div className="flex items-center gap-1.5">
                        {confirmClearIdx === idx ? (
                          <div className="flex items-center gap-1.5 rounded-xl bg-red-50/50 p-1 dark:bg-red-950/20 border border-red-100 dark:border-red-950/30">
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 px-1">Clear?</span>
                            <button
                              type="button"
                              onClick={() => {
                                handleClearSlot(idx);
                                setConfirmClearIdx(null);
                              }}
                              className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmClearIdx(null)}
                              className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmClearIdx(idx)}
                            className="rounded-xl border border-red-100 bg-red-50/20 p-2.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:border-red-950/20 dark:bg-red-950/10 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                            title="Remove Key"
                            aria-label="Remove Key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline validations/errors feedback per slot */}
                {valState === "valid" && !hasChanged && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    {slotWarnings[idx] ? "Key saved locally; verification is pending." : "Key saved locally."}
                  </div>
                )}

                {error && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400 leading-normal">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Validation Error:</span> {error}
                    </div>
                  </div>
                )}
                {slotWarnings[idx] && !error && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{slotWarnings[idx]}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
