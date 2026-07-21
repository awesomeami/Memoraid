import React, { useState, useEffect, lazy, Suspense, useCallback } from "react";
import { MnemonicResult, ActiveTab, MEDICAL_SPECIALTIES, MNEMONIC_STYLES, MnemonicDetails, MAX_MEDICAL_TEXT_LENGTH, DEFAULT_MODEL, LITE_MODEL, PRO_MODEL } from "./types";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import MnemonicCard from "./components/MnemonicCard";
import SignInScreen from "./components/SignInScreen";

const HistorySidebar = lazy(() => import("./components/HistorySidebar"));
const FavoritesGrid = lazy(() => import("./components/FavoritesGrid"));
const SettingsTab = lazy(() => import("./components/SettingsTab"));
import { Sparkles, Brain, FileText, AlertCircle, RefreshCw, Trash2, Plus, Info, Key, Settings as SettingsIcon, ExternalLink, X, ChevronDown, Award, Loader2, Upload, Camera } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, onAuthStateChanged, User, signOut, googleProvider, signInWithPopup } from "./lib/firebase";
import { getUserMnemonics, saveUserMnemonic, deleteUserMnemonic, migrateLocalToFirestore, getUserFavorites } from "./lib/db";

// List of fun rotating status messages to display on the clinical loader
const LOADING_STATUSES = [
  "Reading clinical text & symptoms...",
  "Extracting critical pathophysiological facts...",
  "Grouping interrelated diagnostic criteria...",
  "Evaluating Priorities (Priority 1: Real English words)...",
  "Formulating pronounceable pseudo-word back-ups...",
  "Engaging funny story-based visualization layers...",
  "Assessing cognitive recall and memorability score...",
  "Rigorously verifying medical accuracy against literature..."
];

class GenError extends Error {
  type: "key" | "server" | "auth";
  constructor(message: string, type: "key" | "server" | "auth") {
    super(message);
    this.type = type;
  }
}

export default function App() {
  const [history, setHistory] = useState<MnemonicResult[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // User Auth States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [skippedAuth, setSkippedAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const handleSelectExample = useCallback((text: string) => {
    setMedicalText(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);
  const [favorites, setFavorites] = useState<MnemonicResult[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("generate");
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Pagination States for Firestore History
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [isSearchingFullHistory, setIsSearchingFullHistory] = useState(false);

  // Keep refs of latest states to avoid effect re-trigger loops
  const latestHistoryRef = React.useRef(history);
  useEffect(() => {
    latestHistoryRef.current = history;
  }, [history]);

  const latestHasMoreHistoryRef = React.useRef(hasMoreHistory);
  useEffect(() => {
    latestHasMoreHistoryRef.current = hasMoreHistory;
  }, [hasMoreHistory]);

  const searchLoopRunningRef = React.useRef(false);

  // Reset history search when user logs in/out or switches identity
  useEffect(() => {
    setHistorySearch("");
    setIsSearchingFullHistory(false);
  }, [currentUser]);

  // Auto-pagination on history search
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) return;
    if (historySearch.trim() === "") {
      setIsSearchingFullHistory(false);
      return;
    }
    if (!hasMoreHistory) return;
    if (searchLoopRunningRef.current) return;

    let active = true;

    const fetchAllRemaining = async () => {
      searchLoopRunningRef.current = true;
      setIsSearchingFullHistory(true);

      while (active && historySearch.trim() !== "" && latestHasMoreHistoryRef.current) {
        try {
          const currentList = latestHistoryRef.current;
          const lastItem = currentList[currentList.length - 1];
          const lastTimestamp = lastItem ? lastItem.timestamp : undefined;

          const moreItems = await getUserMnemonics(currentUser.uid, 50, lastTimestamp);

          if (!active || historySearch.trim() === "") {
            break;
          }

          if (moreItems.length > 0) {
            setHistory((prev) => {
              const merged = [...prev];
              moreItems.forEach((item) => {
                if (!merged.some((existing) => existing.id === item.id)) {
                  merged.push(item);
                }
              });
              merged.sort((a, b) => b.timestamp - a.timestamp);
              return merged;
            });
          }

          const hasMoreFetched = moreItems.length === 50;
          setHasMoreHistory(hasMoreFetched);

          if (!hasMoreFetched) {
            break;
          }

          // Small delay to yield the CPU and let React process renders
          await new Promise((resolve) => setTimeout(resolve, 80));
        } catch (err) {
          console.error("Error during background full history search:", err);
          break;
        }
      }

      setIsSearchingFullHistory(false);
      searchLoopRunningRef.current = false;
    };

    fetchAllRemaining();

    return () => {
      active = false;
    };
  }, [historySearch, currentUser]);

  // Input states
  const [medicalText, setMedicalText] = useState("");
  const [specialty, setSpecialty] = useState<string>(() => {
    return localStorage.getItem("medmnemonic_specialty") || "General Medical Fact";
  });
  const [mnemonicStyle, setMnemonicStyle] = useState<string>(() => {
    return localStorage.getItem("medmnemonic_mnemonic_style") || "Any";
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("medmnemonic_selected_model") || DEFAULT_MODEL;
  });

  // Output states
  const [activeMnemonic, setActiveMnemonic] = useState<MnemonicResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorType, setErrorType] = useState<"key" | "server" | "auth" | "none">("none");
  const [generatedKeySlot, setGeneratedKeySlot] = useState<number | null>(null);
  const [alternativesExpanded, setAlternativesExpanded] = useState(false);

  // OCR/Image Text Extraction States & Refs
  const [isOcrExtracting, setIsOcrExtracting] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const ocrAbortControllerRef = React.useRef<AbortController | null>(null);

  const [ocrQueue, setOcrQueue] = useState<{ id: string; file: File; objectUrl: string }[]>([]);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsUploadOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUploadOpen(false);
      }
    };

    if (isUploadOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUploadOpen]);

  // Keep track of active object URLs in a ref and automatically revoke them when they are removed, replaced, or on unmount
  const activeUrlsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentUrls = new Set(ocrQueue.map(item => item.objectUrl));
    
    activeUrlsRef.current.forEach(url => {
      if (!currentUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    });

    activeUrlsRef.current = currentUrls;
  }, [ocrQueue]);

  useEffect(() => {
    return () => {
      activeUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const handleCancelOcr = () => {
    if (ocrAbortControllerRef.current) {
      ocrAbortControllerRef.current.abort();
      ocrAbortControllerRef.current = null;
    }
    setIsOcrExtracting(false);
  };

  const handleRemoveFromQueue = (id: string) => {
    if (isOcrExtracting) return;
    setOcrQueue(prev => prev.filter(q => q.id !== id));
    setOcrNote(null);
  };

  const handleClearQueue = () => {
    if (isOcrExtracting) return;
    setOcrQueue([]);
    setOcrNote(null);
  };

  const addFilesToQueue = (files: File[]) => {
    if (isOcrExtracting) return;
    setOcrNote(null);
    setErrorMessage("");
    setErrorType("none");

    const validFiles: File[] = [];
    const heicErrors: string[] = [];

    files.forEach((file, index) => {
      const fileName = file.name ? file.name.toLowerCase() : "";
      const fileType = file.type ? file.type.toLowerCase() : "";
      const isHeic =
        fileType === "image/heic" ||
        fileType === "image/heif" ||
        fileName.endsWith(".heic") ||
        fileName.endsWith(".heif");

      if (isHeic) {
        heicErrors.push(`Photo ${index + 1} is a HEIC file — please use JPEG, PNG, or a screenshot instead`);
      } else if (fileType.startsWith("image/") || (!fileType && /\.(jpe?g|png|webp|gif|bmp)$/i.test(fileName))) {
        validFiles.push(file);
      }
    });

    if (heicErrors.length > 0) {
      setErrorMessage(heicErrors.join(" | "));
      setErrorType("server");
    }

    if (validFiles.length === 0) return;

    setOcrQueue(prev => {
      const currentCount = prev.length;
      if (currentCount >= 3) {
        setOcrNote(`Queue is already full (3/3). Skipped ${validFiles.length} photo(s).`);
        return prev;
      }

      const spaceLeft = 3 - currentCount;
      const filesToAdd = validFiles.slice(0, spaceLeft);
      const skippedCount = validFiles.length - filesToAdd.length;

      if (skippedCount > 0) {
        setOcrNote(`Added ${filesToAdd.length} photo(s). Skipped ${skippedCount} to respect the 3-photo limit.`);
      }

      const newItems = filesToAdd.map(file => ({
        id: crypto.randomUUID(),
        file,
        objectUrl: URL.createObjectURL(file)
      }));

      return [...prev, ...newItems];
    });
  };

  const compressImage = async (file: File, controllerSignal: AbortSignal): Promise<{ imageBase64: string; mimeType: string }> => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = objectUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image."));
        controllerSignal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

      let { width, height } = img;
      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not create canvas 2D context.");
      }
      ctx.drawImage(img, 0, 0, width, height);

      const jpegBase64Url = canvas.toDataURL("image/jpeg", 0.75);
      const prefix = "data:image/jpeg;base64,";
      if (!jpegBase64Url.startsWith(prefix)) {
        throw new Error("Failed to export image as base64 JPEG.");
      }
      const imageBase64 = jpegBase64Url.substring(prefix.length);
      return { imageBase64, mimeType: "image/jpeg" };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleExtractTextFromQueue = async () => {
    if (ocrQueue.length === 0) return;
    if (isOcrExtracting) return;

    setIsOcrExtracting(true);
    setErrorMessage("");
    setErrorType("none");
    setOcrNote(null);

    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;

    try {
      if (!currentUser) {
        throw new GenError("You're not signed in. Please sign in or continue as guest again before extracting text.", "auth");
      }

      const { configuredKeys, startIndex } = getConfiguredGeminiKeys();

      if (configuredKeys.length === 0) {
        throw new GenError("Please configure at least one Gemini API Key in the Settings tab.", "key");
      }

      // 1. Compress all queued images
      const compressedImages = await Promise.all(
        ocrQueue.map(item => compressImage(item.file, controller.signal))
      );

      let success = false;
      let attempts = 0;
      let currentTryIndex = startIndex;
      let appRateLimitError: string | null = null;
      let lastKeyErrorMessage: string | null = null;
      let resPages: any[] = [];

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      try {
        const idToken = await currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${idToken}`;
      } catch (tokenErr) {
        console.error("Failed to acquire Firebase ID Token for OCR:", tokenErr);
      }

      while (attempts < configuredKeys.length && !success) {
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        const currentItem = configuredKeys[currentTryIndex];
        const keyToUse = currentItem.key;
        const keySlotIndex = currentItem.index;

        headers["X-User-Gemini-Key"] = keyToUse.trim();

        try {
          const response = await fetch("/api/mnemonic/ocr-extract", {
            method: "POST",
            headers,
            signal: controller.signal,
            body: JSON.stringify({
              images: compressedImages
            }),
          });

          let resData: any = null;
          let isJson = true;
          try {
            resData = await response.json();
          } catch (jsonErr) {
            isJson = false;
          }

          if (isJson && resData && resData.error === "APP_RATE_LIMIT") {
            appRateLimitError = resData.details || "Rate limit exceeded. Please try again later.";
            break;
          }

          if (!isJson) { if (response.status === 504) { throw new GenError("The server timed out waiting for the AI to respond. Please try again.", "server"); } else if (response.status === 502 || response.status === 503) { throw new GenError("The AI service is currently experiencing high demand and returned a gateway error. Please try again later.", "server"); } throw new GenError("The server returned an unexpected response — this looks like a temporary backend issue, not a problem with your API keys.", "server"); }

          const isKeyOrQuotaError = 
            response.status === 403 || 
            response.status === 429 || 
            response.status === 503 ||
            (resData && (
              resData.error === "GEMINI_KEY_ERROR" || 
              resData.error === "RESOURCE_EXHAUSTED" || 
              resData.error === "SERVICE_UNAVAILABLE"
            ));

          if (response.status === 401) {
            throw new GenError("Your session expired or sign-in failed. Please sign in again.", "auth");
          }

          if (response.status === 413) {
            throw new GenError(resData.error || "The image payload is too large.", "server");
          }

          if (response.status === 502 && resData && resData.error === "OCR_PARSE_ERROR") {
            throw new GenError("A formatting error occurred while reading the text. Please try uploading the image again.", "server");
          }

          if (!response.ok) {
            let errorMsg = resData.details || resData.error || `HTTP ${response.status}`;
            if (errorMsg.includes("Firebase Admin SDK is not initialized")) {
              errorMsg = "The app's backend isn't fully configured yet. Please try again later or contact the site owner.";
            }

            if (isKeyOrQuotaError) {
              lastKeyErrorMessage = `Key slot ${keySlotIndex + 1}: ${errorMsg}`;
              console.warn(`Key slot ${keySlotIndex + 1} hit key/quota-specific error during OCR (${response.status}). Retrying with next available key...`);
              currentTryIndex = (currentTryIndex + 1) % configuredKeys.length;
              attempts++;
              continue;
            } else {
              throw new GenError(errorMsg, "server");
            }
          }

          if (resData && Array.isArray(resData.pages)) {
            resPages = resData.pages;
          } else {
            throw new GenError("Invalid response format received from OCR service.", "server");
          }

          success = true;
          setActiveKeyIndex(keySlotIndex);
          const uid = currentUser?.uid || "guest";
          localStorage.setItem(`medmnemonic_gemini_key_index::${uid}`, String(keySlotIndex));
        } catch (err: any) {
          if (err.name === "AbortError") {
            throw err;
          }
          if (err instanceof GenError || (err && (err.type === "server" || err.type === "key" || err.type === "auth"))) {
            throw err;
          }
          const isRetryableErr = err.message && (
            err.message.includes("403") ||
            err.message.includes("429") || 
            err.message.includes("RESOURCE_EXHAUSTED") || 
            err.message.includes("503") || 
            err.message.includes("UNAVAILABLE") || 
            err.message.includes("high demand") ||
            err.message.includes("temporary") ||
            err.message.toLowerCase().includes("api_key_invalid") ||
            err.message.toLowerCase().includes("api key") ||
            err.message.toLowerCase().includes("apikey") ||
            err.message.toLowerCase().includes("permission denied") ||
            err.message.toLowerCase().includes("invalid key") ||
            err.message.toLowerCase().includes("revoked")
          );

          if (err.message && (err.message.includes("401") || err.message.toLowerCase().includes("unauthorized"))) {
            throw new GenError("Your session expired or sign-in failed. Please sign in again.", "auth");
          }

          if (isRetryableErr) {
            lastKeyErrorMessage = `Key slot ${keySlotIndex + 1}: ${err.message}`;
            console.warn(`Key slot ${keySlotIndex + 1} hit retryable or key-specific error during OCR: ${err.message}. Retrying with next available key...`);
            currentTryIndex = (currentTryIndex + 1) % configuredKeys.length;
            attempts++;
            continue;
          }
          throw new GenError("The server returned an unexpected response — this looks like a temporary backend issue, not a problem with your API keys.", "server");
        }
      }

      if (appRateLimitError) {
        throw new GenError(appRateLimitError, "server");
      }

      if (!success) {
        if (lastKeyErrorMessage) {
          throw new GenError(`All configured Gemini API Keys failed. Last error: ${lastKeyErrorMessage}`, "key");
        } else {
          throw new GenError("All configured Gemini API Keys are currently unavailable or rate-limited. The model is experiencing high demand (503) or quota limits. Please try again in a few moments.", "key");
        }
      }

      // Process pages and append to medicalText
      let newExtractedParts: string[] = [];
      let noTextPhotos: number[] = [];

      resPages.forEach((p: any, idx: number) => {
        const pageText = p.extractedText ? p.extractedText.trim() : "";
        if (!pageText || pageText === "NO_TEXT_FOUND") {
          noTextPhotos.push(idx + 1);
        } else {
          newExtractedParts.push(pageText);
        }
      });

      if (newExtractedParts.length > 0) {
        const joinedExtractedText = newExtractedParts.join("\n\n");
        let combinedText = medicalText ? medicalText + "\n\n" + joinedExtractedText : joinedExtractedText;
        if (combinedText.length > MAX_MEDICAL_TEXT_LENGTH) {
          combinedText = combinedText.substring(0, MAX_MEDICAL_TEXT_LENGTH);
          setOcrNote("Text appended but truncated to fit the limit.");
        }
        setMedicalText(combinedText);
      }

      if (noTextPhotos.length > 0) {
        const noteStr = `Photo ${noTextPhotos.join(", ")}: no text detected`;
        setOcrNote(prev => prev ? prev + " | " + noteStr : noteStr);
      } else if (newExtractedParts.length > 0 && !ocrNote) {
        setOcrNote("Text extracted successfully!");
      }

      // Clear the queue on success
      handleClearQueue();

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("OCR extraction cancelled by user.");
        return;
      }
      console.error("Failed processing OCR batch:", err);
      if (err instanceof GenError) {
        setErrorMessage(err.message);
        setErrorType(err.type);
      } else {
        setErrorMessage(err?.message || "Failed to read image files or connect to generative server.");
        setErrorType("server");
      }
    } finally {
      setIsOcrExtracting(false);
      ocrAbortControllerRef.current = null;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isOcrExtracting) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      addFilesToQueue(pastedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isOcrExtracting) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (isOcrExtracting) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  // Health check state
  const [healthStatus, setHealthStatus] = useState<{
    firebaseAdminInitialized: boolean;
    firestoreReachable: boolean;
    checked: boolean;
  }>({
    firebaseAdminInitialized: true,
    firestoreReachable: true,
    checked: false,
  });

  // User Gemini Keys and active index client-side state
  const [userGeminiKeys, setUserGeminiKeys] = useState<string[]>(["", "", "", "", ""]);
  const [activeKeyIndex, setActiveKeyIndex] = useState<number>(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const refreshKeysState = () => {
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
    let keysList = ["", "", "", "", ""];
    if (keysRaw) {
      try {
        const parsed = JSON.parse(keysRaw);
        if (Array.isArray(parsed)) {
          keysList = [...parsed, "", "", "", "", ""].slice(0, 5).map(k => typeof k === "string" ? k.trim() : "");
        }
      } catch (e) {
        console.error("Failed to parse saved keys:", e);
      }
    } else {
      // Migrate legacy single key
      const oldKey = localStorage.getItem("medmnemonic_user_gemini_key");
      if (oldKey && oldKey.trim()) {
        keysList[0] = oldKey.trim();
        localStorage.setItem(keysStorageKey, JSON.stringify(keysList));
        localStorage.removeItem("medmnemonic_user_gemini_key");
      }
    }
    setUserGeminiKeys(keysList);

    const idxRaw = localStorage.getItem(indexStorageKey);
    let activeIdx = 0;
    if (idxRaw) {
      const parsedIdx = parseInt(idxRaw, 10);
      if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < 5) {
        activeIdx = parsedIdx;
      }
    }
    setActiveKeyIndex(activeIdx);
  };

  const getConfiguredGeminiKeys = () => {
    const configuredKeys = userGeminiKeys
      .map((key, index) => ({ key, index }))
      .filter((item) => item.key && item.key.trim() !== "");

    let startIndex = configuredKeys.findIndex((item) => item.index === activeKeyIndex);
    if (startIndex === -1) {
      startIndex = 0;
    }
    return { configuredKeys, startIndex };
  };

  // Sync personal Gemini keys on mount and tab/user changes
  useEffect(() => {
    refreshKeysState();
  }, [activeTab, currentUser]);

  // Run lightweight backend health check once on mount
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (active) {
          setHealthStatus({
            firebaseAdminInitialized: data.firebaseAdminInitialized,
            firestoreReachable: data.firestoreReachable,
            checked: true,
          });
        }
      } catch (err) {
        console.error("Backend health check failed:", err);
        if (active) {
          setHealthStatus({
            firebaseAdminInitialized: false,
            firestoreReachable: false,
            checked: true,
          });
        }
      }
    };
    checkHealth();
    return () => {
      active = false;
    };
  }, []);

  const hasConfiguredKey = userGeminiKeys.some(k => k && k.trim() !== "");

  // Keep track of the previous user to facilitate key/data migration on transition
  const prevUserRef = React.useRef<User | null>(null);
  useEffect(() => {
    prevUserRef.current = currentUser;
  }, [currentUser]);

  // Listen to Auth State Changes & Load/Sync History
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        if (!user.isAnonymous && prevUserRef.current?.isAnonymous) {
          const anonUid = prevUserRef.current.uid;
          const googleUid = user.uid;
          const anonKeysKey = `medmnemonic_gemini_keys::${anonUid}`;
          const anonIdxKey = `medmnemonic_gemini_key_index::${anonUid}`;
          const googleKeysKey = `medmnemonic_gemini_keys::${googleUid}`;
          const googleIdxKey = `medmnemonic_gemini_key_index::${googleUid}`;
          
          const anonKeys = localStorage.getItem(anonKeysKey);
          const anonIdx = localStorage.getItem(anonIdxKey);
          
          if (anonKeys) {
            localStorage.setItem(googleKeysKey, anonKeys);
          }
          if (anonIdx) {
            localStorage.setItem(googleIdxKey, anonIdx);
          }
        }

        setCurrentUser(user);
        setSkippedAuth(false);
        
        if (!user.isAnonymous) {
          // 1. Google Signed-In User: Sync/Load Firestore History
          try {
            const firestoreHistory = await getUserMnemonics(user.uid, 50);
            setHasMoreHistory(firestoreHistory.length === 50);
            
            // Migrate any local storage history to firestore upon sign-in
            const localRaw = localStorage.getItem("medmnemonic_history");
            let localHistory: MnemonicResult[] = [];
            if (localRaw) {
              try {
                localHistory = JSON.parse(localRaw);
              } catch (e) {
                console.error("Failed to parse local history for migration:", e);
              }
            }
            
            if (localHistory.length > 0) {
              const migrated = await migrateLocalToFirestore(user.uid, localHistory);
              
              // Remove offline history from localstorage to avoid duplicate migration trigger
              localStorage.removeItem("medmnemonic_history");
              
              // Merge Firestore history with migrated history (prevent duplicates)
              const merged = [...firestoreHistory];
              migrated.forEach((m) => {
                if (!merged.some((f) => f.id === m.id)) {
                  merged.push(m);
                }
              });
              
              // Sort descending by timestamp
              merged.sort((a, b) => b.timestamp - a.timestamp);
              setHistory(merged);

              try {
                const firestoreFavorites = await getUserFavorites(user.uid);
                setFavorites(firestoreFavorites);
              } catch (favErr) {
                console.error("Failed to fetch favorites:", favErr);
              }
            } else {
              setHistory(firestoreHistory);
              try {
                const firestoreFavorites = await getUserFavorites(user.uid);
                setFavorites(firestoreFavorites);
              } catch (favErr) {
                console.error("Failed to fetch favorites:", favErr);
              }
            }
          } catch (error) {
            console.error("Failed to load or sync user history with Firestore:", error);
          }
        } else {
          // 2. Anonymous User (Guest): Load from localStorage
          setHasMoreHistory(false);
          const localRaw = localStorage.getItem("medmnemonic_history");
          if (localRaw) {
            try {
              const parsedHistory = JSON.parse(localRaw);
              setHistory(parsedHistory);
              setFavorites(parsedHistory.filter((item: MnemonicResult) => item.isFavorite));
            } catch (e) {
              console.error("Failed to parse local history for guest user:", e);
            }
          } else {
            setHistory([]);
            setFavorites([]);
          }
        }
      } else {
        // 3. Unauthenticated State
        setCurrentUser(null);
        setHistory([]);
        setFavorites([]);
        setHasMoreHistory(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoadMoreHistory = async () => {
    if (!currentUser || currentUser.isAnonymous || isLoadingMoreHistory) return;
    setIsLoadingMoreHistory(true);
    try {
      const lastItem = history[history.length - 1];
      const lastTimestamp = lastItem ? lastItem.timestamp : undefined;
      const moreItems = await getUserMnemonics(currentUser.uid, 50, lastTimestamp);
      
      if (moreItems.length > 0) {
        setHistory((prev) => {
          const merged = [...prev];
          moreItems.forEach((item) => {
            if (!merged.some((existing) => existing.id === item.id)) {
              merged.push(item);
            }
          });
          merged.sort((a, b) => b.timestamp - a.timestamp);
          return merged;
        });
      }
      setHasMoreHistory(moreItems.length === 50);
    } catch (error) {
      console.error("Failed to load more history:", error);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  };

  // Sync Guest Theme from LocalStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("medmnemonic_theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      // Default mode should be dark mode
      setTheme("dark");
    }
  }, []);

  // Write history to localStorage whenever it changes (ONLY for guest/anonymous users)
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) {
      try {
        const cappedHistory = history.slice(0, 150);
        localStorage.setItem("medmnemonic_history", JSON.stringify(cappedHistory));
        setFavorites(cappedHistory.filter((item) => item.isFavorite));
        setStorageWarning(null);
      } catch (err: any) {
        console.error("Local storage quota exceeded or failed:", err);
        setStorageWarning("Your local browser storage is full. Please Sign In with Google to enable unlimited cloud backup, or clear some history items.");
      }
    }
  }, [history, currentUser]);

  // Synchronize theme to document element
  useEffect(() => {
    localStorage.setItem("medmnemonic_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Persist specialty to localStorage
  useEffect(() => {
    localStorage.setItem("medmnemonic_specialty", specialty);
  }, [specialty]);

  // Persist mnemonicStyle to localStorage
  useEffect(() => {
    localStorage.setItem("medmnemonic_mnemonic_style", mnemonicStyle);
  }, [mnemonicStyle]);

  // Persist selectedModel to localStorage
  useEffect(() => {
    localStorage.setItem("medmnemonic_selected_model", selectedModel);
  }, [selectedModel]);

  // Rotate loading statuses periodically during API call
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingStatusIndex((prev) => (prev + 1) % LOADING_STATUSES.length);
      }, 2500);
    } else {
      setLoadingStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Call API to generate clinical mnemonics
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!medicalText.trim()) return;

    setIsLoading(true);
    setErrorMessage("");
    setErrorType("none");
    setActiveMnemonic(null);
    setGeneratedKeySlot(null);

    try {
      if (!currentUser) {
        throw new GenError("You're not signed in. Please sign in or continue as guest again before generating.", "auth");
      }

      const generationId = "gen_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
      // Add Authorization Bearer ID Token if user is authenticated
      const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        "X-Generation-ID": generationId
      };
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch (tokenErr) {
          console.error("Failed to acquire Firebase ID Token:", tokenErr);
        }
      }

      const { configuredKeys, startIndex } = getConfiguredGeminiKeys();

      if (configuredKeys.length === 0) {
        throw new GenError("Please configure at least one Gemini API Key in the Settings tab.", "key");
      }

      let data: any = null;
      let success = false;
      let attempts = 0;
      let currentTryIndex = startIndex;
      let appRateLimitError: string | null = null;
      let lastKeyErrorMessage: string | null = null;

      while (attempts < configuredKeys.length && !success) {
        const currentItem = configuredKeys[currentTryIndex];
        const keyToUse = currentItem.key;
        const keySlotIndex = currentItem.index;

        headers["X-User-Gemini-Key"] = keyToUse.trim();

        try {
          const response = await fetch("/api/mnemonic/generate", {
            method: "POST",
            headers,
            body: JSON.stringify({
              medicalText,
              specialty,
              mnemonicStyle: mnemonicStyle === "Any" ? "" : mnemonicStyle,
              selectedModel
            }),
          });

          let resData: any = null;
          let isJson = true;
          try {
            resData = await response.json();
          } catch (jsonErr) {
            isJson = false;
          }

          if (isJson && resData && resData.error === "APP_RATE_LIMIT") {
            appRateLimitError = resData.details || "Rate limit exceeded. Please try again later.";
            break;
          }

          if (!isJson) { if (response.status === 504) { throw new GenError("The server timed out waiting for the AI to respond. Please try again.", "server"); } else if (response.status === 502 || response.status === 503) { throw new GenError("The AI service is currently experiencing high demand and returned a gateway error. Please try again later.", "server"); } throw new GenError("The server returned an unexpected response — this looks like a temporary backend issue, not a problem with your API keys.", "server"); }

          const isKeyOrQuotaError = 
            response.status === 403 || 
            response.status === 429 || 
            response.status === 503 ||
            (resData && (
              resData.error === "GEMINI_KEY_ERROR" || 
              resData.error === "RESOURCE_EXHAUSTED" || 
              resData.error === "SERVICE_UNAVAILABLE"
            ));

          if (response.status === 401) {
            throw new GenError("Your session expired or sign-in failed. Please sign in again.", "auth");
          }

          if (!response.ok) {
            let errorMsg = resData.details || resData.error || `HTTP ${response.status}`;
            if (errorMsg.includes("Firebase Admin SDK is not initialized")) {
              errorMsg = "The app's backend isn't fully configured yet. Please try again later or contact the site owner.";
            }

            if (isKeyOrQuotaError) {
              lastKeyErrorMessage = `Key slot ${keySlotIndex + 1}: ${errorMsg}`;
              console.warn(`Key slot ${keySlotIndex + 1} hit key/quota-specific error (${response.status}). Retrying with next available key...`);
              currentTryIndex = (currentTryIndex + 1) % configuredKeys.length;
              attempts++;
              continue;
            } else {
              if (errorMsg.includes("Firebase Admin SDK") || errorMsg.includes("Rate limit") || errorMsg.includes("exceeds the maximum")) {
                throw new GenError(errorMsg, "server");
              }
              throw new GenError("The server returned an unexpected response — this looks like a temporary backend issue, not a problem with your API keys.", "server");
            }
          }

          // Successful call!
          data = resData;
          success = true;
          setGeneratedKeySlot(keySlotIndex + 1);

          // Save last-working index in storage and component state
          const uid = currentUser?.uid || "guest";
          const indexStorageKey = `medmnemonic_gemini_key_index::${uid}`;
          localStorage.setItem(indexStorageKey, String(keySlotIndex));
          setActiveKeyIndex(keySlotIndex);
        } catch (err: any) {
          if (err instanceof GenError || (err && (err.type === "server" || err.type === "key" || err.type === "auth"))) {
            throw err;
          }
          const isRetryableErr = err.message && (
            err.message.includes("403") ||
            err.message.includes("429") || 
            err.message.includes("RESOURCE_EXHAUSTED") || 
            err.message.includes("503") || 
            err.message.includes("UNAVAILABLE") || 
            err.message.includes("high demand") ||
            err.message.includes("temporary") ||
            err.message.toLowerCase().includes("api_key_invalid") ||
            err.message.toLowerCase().includes("api key") ||
            err.message.toLowerCase().includes("apikey") ||
            err.message.toLowerCase().includes("permission denied") ||
            err.message.toLowerCase().includes("invalid key") ||
            err.message.toLowerCase().includes("revoked")
          );

          if (err.message && (err.message.includes("401") || err.message.toLowerCase().includes("unauthorized"))) {
            throw new GenError("Your session expired or sign-in failed. Please sign in again.", "auth");
          }

          if (isRetryableErr) {
            lastKeyErrorMessage = `Key slot ${keySlotIndex + 1}: ${err.message}`;
            console.warn(`Key slot ${keySlotIndex + 1} hit retryable or key-specific error: ${err.message}. Retrying with next available key...`);
            currentTryIndex = (currentTryIndex + 1) % configuredKeys.length;
            attempts++;
            continue;
          }
          throw new GenError("The server returned an unexpected response — this looks like a temporary backend issue, not a problem with your API keys.", "server");
        }
      }

      if (appRateLimitError) {
        throw new GenError(appRateLimitError, "server");
      }

      if (!success) {
        if (lastKeyErrorMessage) {
          throw new GenError(`All configured Gemini API Keys failed. Last error: ${lastKeyErrorMessage}`, "key");
        } else {
          throw new GenError("All configured Gemini API Keys are currently unavailable or rate-limited. The model is experiencing high demand (503) or quota limits. Please try again in a few moments.", "key");
        }
      }

      const newMnemonic: MnemonicResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        medicalText: medicalText.trim(),
        specialty,
        mnemonicStyle,
        bestMnemonic: data.bestMnemonic,
        alternativeMnemonics: data.alternativeMnemonics || [],
        isFavorite: false,
        isPinned: false
      };

      // If user is logged in with Google, save to Firestore
      if (currentUser && !currentUser.isAnonymous) {
        try {
          await saveUserMnemonic(currentUser.uid, newMnemonic);
        } catch (dbErr) {
          console.error("Failed to persist newly generated mnemonic in Firestore:", dbErr);
        }
      }

      // Prepend to history and make active
      setHistory((prev) => [newMnemonic, ...prev]);
      setActiveMnemonic(newMnemonic);
      setAlternativesExpanded(false);
      setActiveTab("generate");

    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || "Failed to establish secure connection to generative engine.";
      if (errMsg.includes("Firebase Admin SDK is not initialized")) {
        errMsg = "The app's backend isn't fully configured yet. Please try again later or contact the site owner.";
      }
      const type = err.type || "server";
      setErrorType(type);
      setErrorMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Favorite toggles
  const handleToggleFavorite = useCallback(async (id: string) => {
    let updatedItem: MnemonicResult | null = null;

    setHistory((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          updatedItem = { ...item, isFavorite: !item.isFavorite };
          return updatedItem;
        }
        return item;
      })
    );

    setFavorites((prev) => {
      const exists = prev.some((item) => item.id === id);
      if (exists) {
        return prev.map((item) => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item).filter((item) => item.isFavorite);
      } else {
        const itemToFavorite = history.find((item) => item.id === id) || (activeMnemonic && activeMnemonic.id === id ? activeMnemonic : null);
        if (itemToFavorite) {
          const newItem = { ...itemToFavorite, isFavorite: true };
          return [newItem, ...prev];
        }
        return prev;
      }
    });

    // If the active mnemonic is updated, mirror the favorite status
    if (activeMnemonic && activeMnemonic.id === id) {
      setActiveMnemonic((prev) => (prev ? { ...prev, isFavorite: !prev.isFavorite } : null));
    }

    // Persist change to Firestore for signed in users
    if (currentUser && !currentUser.isAnonymous) {
      // Find the item after state mapping to make sure we have the correct updated state
      const target = history.find((item) => item.id === id) || favorites.find((item) => item.id === id) || (activeMnemonic && activeMnemonic.id === id ? activeMnemonic : null);
      if (target) {
        try {
          await saveUserMnemonic(currentUser.uid, { ...target, isFavorite: !target.isFavorite });
        } catch (dbErr) {
          console.error("Failed to update favorite toggle in Firestore:", dbErr);
        }
      }
    }
  }, [history, favorites, activeMnemonic, currentUser]);

  // Pin toggles
  const handleTogglePin = useCallback(async (id: string) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isPinned: !item.isPinned } : item))
    );

    setFavorites((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isPinned: !item.isPinned } : item))
    );

    // If active is updated, mirror pin status
    if (activeMnemonic && activeMnemonic.id === id) {
      setActiveMnemonic((prev) => (prev ? { ...prev, isPinned: !prev.isPinned } : null));
    }

    // Persist change to Firestore for signed in users
    if (currentUser && !currentUser.isAnonymous) {
      const target = history.find((item) => item.id === id) || favorites.find((item) => item.id === id) || (activeMnemonic && activeMnemonic.id === id ? activeMnemonic : null);
      if (target) {
        try {
          await saveUserMnemonic(currentUser.uid, { ...target, isPinned: !target.isPinned });
        } catch (dbErr) {
          console.error("Failed to update pin toggle in Firestore:", dbErr);
        }
      }
    }
  }, [history, favorites, activeMnemonic, currentUser]);

  // Delete from history
  const handleDeleteMnemonic = async (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setFavorites((prev) => prev.filter((item) => item.id !== id));
    if (activeMnemonic && activeMnemonic.id === id) {
      setActiveMnemonic(null);
    }

    // Delete from Firestore for signed in users
    if (currentUser && !currentUser.isAnonymous) {
      try {
        await deleteUserMnemonic(currentUser.uid, id);
      } catch (dbErr) {
        console.error("Failed to delete mnemonic from Firestore:", dbErr);
      }
    }
  };

  // Swap an alternative mnemonic with the top best mnemonic
  const handleSelectAlternativeAsBest = useCallback(async (alternativeIdx: number) => {
    if (!activeMnemonic) return;

    const currentBest = { ...activeMnemonic.bestMnemonic };
    const chosenAlternative = { ...activeMnemonic.alternativeMnemonics[alternativeIdx] };

    const updatedMnemonic = {
      ...activeMnemonic,
      bestMnemonic: chosenAlternative,
      alternativeMnemonics: activeMnemonic.alternativeMnemonics.map((alt, idx) =>
        idx === alternativeIdx ? currentBest : alt
      )
    };

    // Update active
    setActiveMnemonic(updatedMnemonic);

    // Update history entry as well
    setHistory((prev) =>
      prev.map((item) => (item.id === updatedMnemonic.id ? updatedMnemonic : item))
    );

    // Update favorites as well
    setFavorites((prev) =>
      prev.map((item) => (item.id === updatedMnemonic.id ? updatedMnemonic : item))
    );

    // Update Firestore for signed in users
    if (currentUser && !currentUser.isAnonymous) {
      try {
        await saveUserMnemonic(currentUser.uid, updatedMnemonic);
      } catch (dbErr) {
        console.error("Failed to update swapped mnemonic in Firestore:", dbErr);
      }
    }
  }, [activeMnemonic, currentUser]);

  // Save edited mnemonic details (handles Winner/Alternative updates)
  const handleSaveMnemonicDetails = useCallback(async (updatedData: MnemonicDetails, alternativeIdx: number) => {
    if (!activeMnemonic) return;

    const updatedMnemonic = { ...activeMnemonic };
    if (alternativeIdx === -1) {
      updatedMnemonic.bestMnemonic = updatedData;
    } else {
      const updatedAlternatives = [...updatedMnemonic.alternativeMnemonics];
      updatedAlternatives[alternativeIdx] = updatedData;
      updatedMnemonic.alternativeMnemonics = updatedAlternatives;
    }

    // Update active view
    setActiveMnemonic(updatedMnemonic);

    // Update history array
    setHistory((prev) =>
      prev.map((item) => (item.id === updatedMnemonic.id ? updatedMnemonic : item))
    );

    // Update favorites array
    setFavorites((prev) =>
      prev.map((item) => (item.id === updatedMnemonic.id ? updatedMnemonic : item))
    );

    // Persist change to Firestore for signed-in users
    if (currentUser && !currentUser.isAnonymous) {
      try {
        await saveUserMnemonic(currentUser.uid, updatedMnemonic);
      } catch (dbErr) {
        console.error("Failed to save edited mnemonic in Firestore:", dbErr);
      }
    }
  }, [activeMnemonic, currentUser]);

  const onToggleFavoriteStable = useCallback(() => {
    if (activeMnemonic) {
      handleToggleFavorite(activeMnemonic.id);
    }
  }, [activeMnemonic, handleToggleFavorite]);

  const onTogglePinStable = useCallback(() => {
    if (activeMnemonic) {
      handleTogglePin(activeMnemonic.id);
    }
  }, [activeMnemonic, handleTogglePin]);

  const onSaveBestStable = useCallback((updatedData: MnemonicDetails) => {
    handleSaveMnemonicDetails(updatedData, -1);
  }, [handleSaveMnemonicDetails]);

  // Clean all inputs
  const handleResetInput = () => {
    setMedicalText("");
    setErrorMessage("");
  };

  // Load an existing history item back into the active workspace view
  const handleSelectFromHistory = (item: MnemonicResult) => {
    setActiveMnemonic(item);
    setMedicalText(item.medicalText);
    setSpecialty(item.specialty);
    setMnemonicStyle(item.mnemonicStyle || "Any");
    setAlternativesExpanded(false);
    setActiveTab("generate");
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Brain className="h-10 w-10 text-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider animate-pulse">
            Loading your clinical study workspace...
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser && !skippedAuth) {
    return <SignInScreen onContinueAsGuest={() => setSkippedAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Top sticky navigation header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        setTheme={setTheme}
        favoritesCount={favorites.length}
        historyCount={history.length}
        currentUser={currentUser}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 pb-24 sm:pb-8">
        {/* Backend health alert banner */}
        {healthStatus.checked && !healthStatus.firebaseAdminInitialized && (
          <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-950/30 dark:bg-rose-950/10 text-rose-800 dark:text-rose-400">
            <div className="flex gap-2.5 items-start">
              <span className="text-base select-none">⚠️</span>
              <div className="space-y-0.5">
                <p className="text-xs leading-relaxed font-medium">
                  Cloud sync and secure key validation are temporarily unavailable. Mnemonic generation may not work until this is resolved.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Auth Banner for guest users */}
        {currentUser && currentUser.isAnonymous && (
          <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-950/30 dark:bg-amber-950/10 text-amber-800 dark:text-amber-400">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex gap-2.5 items-start">
                <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Guest Mode Active
                  </h4>
                  <p className="text-xs leading-relaxed opacity-90">
                    Your generated mnemonics and study cards are only saved in this browser. Sign in with Google to sync them securely across devices.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await signInWithPopup(auth, googleProvider);
                  } catch (error) {
                    console.error("Error signing in with Google:", error);
                  }
                }}
                className="rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900 px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer text-amber-900 dark:text-amber-200"
              >
                Sign In with Google
              </button>
            </div>
          </div>
        )}
        {/* Render Tab Views dynamically */}
        <AnimatePresence mode="wait">
          {activeTab === "generate" && (
            <motion.div
              key="generate-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid gap-8 lg:grid-cols-12 max-w-3xl mx-auto lg:max-w-none"
            >
              {/* Left Column: Generator Form (Takes 5 cols of space) */}
              <div className="lg:col-span-5 space-y-6">
                {!hasConfiguredKey ? (
                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="flex flex-col items-center text-center p-4">
                      <motion.div
                        animate={{
                          y: [0, -12, 0, -12, 0, -6, 0],
                        }}
                        transition={{
                          duration: 1.2,
                          ease: "easeInOut",
                        }}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400 mb-4"
                      >
                        <Key className="h-6 w-6" />
                      </motion.div>
                      <h3 className="font-display text-base font-bold text-slate-800 dark:text-white mb-2">
                        Gemini API Key Required
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-6">
                        To run clinical mnemonic generation safely and privately, Memoraid requires your own personal Google Gemini API key. All generations run via secure direct calls using your credentials.
                      </p>

                      <div className="w-full space-y-3">
                        <a
                          href="https://aistudio.google.com/api-keys"
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-zinc-100 transition-all cursor-pointer shadow-sm"
                        >
                          <span>Get Free API Key</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>

                        {currentUser ? (
                          <button
                            type="button"
                            onClick={() => setActiveTab("settings")}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                          >
                            <SettingsIcon className="h-3.5 w-3.5" />
                            <span>Configure in Settings</span>
                          </button>
                        ) : (
                          <div className="rounded-xl bg-slate-50 p-3 text-left text-[11px] text-slate-500 dark:bg-zinc-800/40 dark:text-zinc-400 border border-slate-100 dark:border-zinc-800">
                            Sign in to configure your Gemini API key.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-center gap-2 mb-4">
                      <Brain className="h-5 w-5 text-blue-500" />
                      <h2 className="font-display text-lg font-bold text-slate-800 dark:text-white">
                        Mnemonic Generator Workspace
                      </h2>
                    </div>

                    <form onSubmit={handleGenerate} className="space-y-4">
                      {/* Large input area */}
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`space-y-1.5 rounded-xl transition-all duration-200 border-2 w-full max-w-full box-border ${
                          isDragging 
                            ? "border-dashed border-blue-500 bg-blue-50/10 dark:bg-blue-950/10 p-2 shadow-inner scale-[1.01]" 
                            : "border-transparent"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Paste Clinical Information
                          </label>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`text-xs ${medicalText.length > MAX_MEDICAL_TEXT_LENGTH ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                              {medicalText.length} / {MAX_MEDICAL_TEXT_LENGTH}
                            </span>
                            
                            <span className="text-slate-300 dark:text-zinc-700">|</span>

                            <div className="relative" ref={popoverRef}>
                              <button
                                type="button"
                                onClick={() => setIsUploadOpen(!isUploadOpen)}
                                disabled={isOcrExtracting}
                                aria-label="Upload Photo"
                                aria-expanded={isUploadOpen}
                                className="text-xs text-blue-500 hover:underline flex items-center gap-1 disabled:opacity-50 disabled:no-underline cursor-pointer font-semibold focus:ring-1 focus:ring-blue-500/30 rounded px-1 outline-none"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                <span>Upload Photo</span>
                                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isUploadOpen ? "rotate-180" : ""}`} />
                              </button>

                              {isUploadOpen && (
                                <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      cameraInputRef.current?.click();
                                      setIsUploadOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors outline-none focus:bg-slate-100 dark:focus:bg-zinc-800"
                                  >
                                    <Camera className="h-3.5 w-3.5 text-blue-500" />
                                    <span>Take Photo</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      fileInputRef.current?.click();
                                      setIsUploadOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors outline-none focus:bg-slate-100 dark:focus:bg-zinc-800"
                                  >
                                    <Upload className="h-3.5 w-3.5 text-blue-500" />
                                    <span>Choose from Files</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <input
                              type="file"
                              ref={cameraInputRef}
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              disabled={isOcrExtracting}
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  addFilesToQueue(Array.from(e.target.files));
                                }
                                e.target.value = "";
                              }}
                              className="hidden"
                            />

                            <input
                              type="file"
                              ref={fileInputRef}
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              disabled={isOcrExtracting}
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  addFilesToQueue(Array.from(e.target.files));
                                }
                                e.target.value = "";
                              }}
                              className="hidden"
                            />

                            {medicalText && (
                              <>
                                <span className="text-slate-300 dark:text-zinc-700">|</span>
                                <button
                                  type="button"
                                  onClick={handleResetInput}
                                  className="text-xs text-red-500 hover:underline cursor-pointer"
                                >
                                  Clear Input
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <textarea
                          ref={textareaRef}
                          value={medicalText}
                          onChange={(e) => setMedicalText(e.target.value)}
                          onPaste={handlePaste}
                          placeholder={isOcrExtracting ? "OCR image processing is active... please wait." : "Paste text from medical textbook, disease features, side effects of a drug, anatomical structures, microbiological facts... (Or paste/drag/upload an image here to extract text)"}
                          rows={7}
                          maxLength={MAX_MEDICAL_TEXT_LENGTH}
                          className="w-full max-w-full box-border rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-100 dark:placeholder-slate-600"
                          required
                          disabled={isOcrExtracting}
                        />

                        {ocrQueue.length > 0 && (
                          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-zinc-900/40 dark:border-zinc-800 w-full max-w-full box-border">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Queued Photos ({ocrQueue.length} / 3)
                              </span>
                              <button
                                type="button"
                                onClick={handleClearQueue}
                                disabled={isOcrExtracting}
                                className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                              >
                                Clear All
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 w-full max-w-full">
                              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 max-w-full overflow-x-auto py-1 scrollbar-none">
                                {ocrQueue.map((item, index) => (
                                  <div key={item.id} className="relative group h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                                    <img
                                      src={item.objectUrl}
                                      alt={`Queued item ${index + 1}`}
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-cover"
                                    />
                                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center">
                                      {index + 1}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={isOcrExtracting}
                                      onClick={() => handleRemoveFromQueue(item.id)}
                                      className="absolute top-1 right-1 bg-rose-500/95 hover:bg-rose-600 disabled:opacity-50 text-white rounded-full p-0.5 shadow-sm transition-colors cursor-pointer"
                                      aria-label={`Remove photo ${index + 1}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                disabled={isOcrExtracting}
                                onClick={handleExtractTextFromQueue}
                                className="ml-auto sm:ml-0 flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-zinc-800 text-white disabled:text-slate-400 dark:disabled:text-zinc-600 px-3 py-2 text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0"
                              >
                                {isOcrExtracting ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Processing...</span>
                                  </>
                                ) : (
                                  <>
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>Extract Text</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {isOcrExtracting && (
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100/50 p-3 text-xs text-slate-600 dark:bg-zinc-800/40 dark:text-zinc-400 border border-slate-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              <span className="font-medium animate-pulse">Extracting medical text from {ocrQueue.length} photo(s)…</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleCancelOcr}
                              className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:underline cursor-pointer px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {ocrNote && (
                          <div className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50/50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/10 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/20">
                            <div className="flex gap-2">
                              <Info className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                              <span>{ocrNote}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOcrNote(null)}
                              className="rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/40 p-1 text-emerald-500 dark:text-emerald-400 cursor-pointer shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>



                      {/* Cognitive Strategy select */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Cognitive Strategy
                        </label>
                        <select
                          value={mnemonicStyle}
                          onChange={(e) => setMnemonicStyle(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300"
                        >
                          {MNEMONIC_STYLES.map((style) => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Model Select Options */}
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">
                          Generative Engine Choice
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedModel(LITE_MODEL)}
                            className={`flex flex-col items-start rounded-lg p-2 border text-left transition-all ${
                              selectedModel === LITE_MODEL
                                ? "border-blue-500 bg-blue-50/10 dark:bg-blue-950/20"
                                : "border-slate-100 bg-white hover:bg-slate-100/50 dark:border-zinc-800 dark:bg-zinc-900"
                            }`}
                          >
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                              Flash Lite
                              <span className="rounded bg-blue-100 dark:bg-blue-950 px-1 py-0.2 text-[8px] font-bold text-blue-700 dark:text-blue-400">
                                Fast
                              </span>
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Most reliable availability</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedModel(DEFAULT_MODEL)}
                            className={`flex flex-col items-start rounded-lg p-2 border text-left transition-all ${
                              selectedModel === DEFAULT_MODEL
                                ? "border-blue-500 bg-blue-50/10 dark:bg-blue-950/20"
                                : "border-slate-100 bg-white hover:bg-slate-100/50 dark:border-zinc-800 dark:bg-zinc-900"
                            }`}
                          >
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                              Gemini Flash
                              <span className="rounded bg-blue-100 dark:bg-blue-950 px-1 py-0.2 text-[8px] font-bold text-blue-700 dark:text-blue-400">
                                Free
                              </span>
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Blazing fast & smart</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedModel(PRO_MODEL)}
                            className={`flex flex-col items-start rounded-lg p-2 border text-left transition-all ${
                              selectedModel === PRO_MODEL
                                ? "border-blue-500 bg-blue-50/10 dark:bg-blue-950/20"
                                : "border-slate-100 bg-white hover:bg-slate-100/50 dark:border-zinc-800 dark:bg-zinc-900"
                            }`}
                          >
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                              Gemini Pro
                              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.2 text-[8px] font-bold text-slate-700 dark:text-slate-300">
                                Paid
                              </span>
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Complex STEM reasoning</span>
                          </button>
                        </div>
                      </div>

                      {/* Generate Button */}
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="submit"
                        disabled={isLoading || isOcrExtracting || !medicalText.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black hover:bg-blue-600 border border-black dark:border-white text-white dark:bg-white dark:text-black dark:hover:bg-blue-600 dark:hover:text-white dark:hover:border-blue-600 py-3 text-sm font-bold shadow-md hover:opacity-95 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer font-sans"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Convert to Mnemonic</span>
                      </motion.button>
                    </form>
                  </div>
                )}

                {/* Educational Banner */}
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400">
                  <div className="flex gap-2.5">
                    <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        Cognitive Science Focus
                      </h4>
                      <p className="text-xs leading-relaxed">
                        Rather than forcing awkward random acronyms, the engine is trained to find real English words (<span className="italic text-blue-600 dark:text-blue-400 font-semibold">Priority 1</span>) or highly pronounceable words (<span className="italic text-blue-600 dark:text-blue-400 font-semibold">Priority 2</span>) which are 10x easier to remember under stressful clinical exam conditions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Dynamic Results display (Takes 7 cols) */}
              <div className="lg:col-span-7">
                <AnimatePresence mode="wait">
                  {/* Phase 1: Not Loaded yet (Display Preset Explorer Hero) */}
                  {!isLoading && !activeMnemonic && !errorMessage && (
                    <motion.div
                      key="hero-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <HeroSection onSelectExample={handleSelectExample} />
                    </motion.div>
                  )}

                  {/* Phase 2: Loading State */}
                  {isLoading && (
                    <motion.div
                      key="loading-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="relative flex h-20 w-20 items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                        <Brain className="h-8 w-8 text-blue-500 animate-pulse" />
                      </div>
                      <h3 className="mt-6 font-display text-lg font-bold text-slate-800 dark:text-white">
                        Memoraid thinking...
                      </h3>
                      <p className="mx-auto mt-2 max-w-xs text-xs text-slate-400 dark:text-zinc-500">
                        Please wait while our neuro-medical agent processes your material.
                      </p>

                      {/* Rotating statuses */}
                      <div className="mt-8 h-8 rounded-lg bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-100/50 dark:border-zinc-800/50 flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                        <span>{LOADING_STATUSES[loadingStatusIndex]}</span>
                      </div>
                    </motion.div>
                  )}

                  {/* Phase 3: Error Message */}
                  {errorMessage && (
                    <motion.div
                      key="error-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`rounded-2xl border p-6 ${
                        errorType === "key" 
                          ? "border-amber-100 bg-amber-50/50 dark:border-amber-950/20 dark:bg-amber-950/10" 
                          : errorType === "auth"
                          ? "border-purple-100 bg-purple-50/50 dark:border-purple-950/20 dark:bg-purple-950/10"
                          : "border-rose-100 bg-rose-50/50 dark:border-rose-950/20 dark:bg-rose-950/10"
                      }`}
                    >
                      <div className="flex gap-3">
                        {errorType === "key" ? (
                          <Key className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        ) : errorType === "auth" ? (
                          <Brain className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <h3 className={`font-display text-base font-bold ${
                            errorType === "key" 
                              ? "text-amber-800 dark:text-amber-400" 
                              : errorType === "auth"
                              ? "text-purple-800 dark:text-purple-400"
                              : "text-rose-800 dark:text-rose-400"
                          }`}>
                            {errorType === "key" 
                              ? "Gemini Key or Quota Limit Hit" 
                              : errorType === "auth"
                              ? "Authentication Required"
                              : "Unexpected Server/Backend Issue"}
                          </h3>
                          <p className={`mt-1 text-xs leading-relaxed ${
                            errorType === "key" 
                              ? "text-amber-600 dark:text-amber-400/90" 
                              : errorType === "auth"
                              ? "text-purple-600 dark:text-purple-400/90"
                              : "text-rose-600 dark:text-rose-400/90"
                          }`}>
                            {errorMessage}
                          </p>
                          {errorType === "auth" ? (
                            <button
                              onClick={() => {
                                setSkippedAuth(false);
                                setErrorMessage("");
                              }}
                              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900"
                            >
                              <Brain className="h-3.5 w-3.5" />
                              Go to Sign In Screen
                            </button>
                          ) : (
                            <button
                              onClick={() => handleGenerate()}
                              className={`mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                                errorType === "key"
                                  ? "bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900"
                                  : "bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-900"
                              }`}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Retry Generation
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Phase 4: Display Core Mnemonic Results */}
                  {activeMnemonic && (
                    <motion.div
                      key="result-state"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      {generatedKeySlot !== null && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0, y: -10 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -10 }}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50/70 border border-emerald-100/50 p-3.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400"
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse shrink-0" />
                            <span>Generated successfully using Key Slot {generatedKeySlot}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGeneratedKeySlot(null)}
                            className="rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/40 p-1 text-emerald-500 dark:text-emerald-400 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </motion.div>
                      )}

                      {/* Best Mnemonic ⭐ Card Component */}
                      <MnemonicCard
                        data={activeMnemonic.bestMnemonic}
                        title="Winner Option ⭐"
                        isBest={true}
                        isFavorite={activeMnemonic.isFavorite}
                        isPinned={activeMnemonic.isPinned}
                        onToggleFavorite={onToggleFavoriteStable}
                        onTogglePin={onTogglePinStable}
                        onSave={onSaveBestStable}
                        medicalText={activeMnemonic.medicalText}
                      />

                      {/* Alternatives list */}
                      {activeMnemonic.alternativeMnemonics && activeMnemonic.alternativeMnemonics.length > 0 && (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => setAlternativesExpanded(!alternativesExpanded)}
                            className="flex w-full items-center justify-between rounded-xl bg-slate-50/50 hover:bg-slate-100/40 p-4 text-sm font-bold text-slate-800 dark:bg-zinc-950/20 dark:text-white border border-slate-100 dark:border-zinc-800/80 transition-all shadow-sm focus:outline-none cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <Award className="h-4 w-4 text-blue-500 animate-pulse" />
                              <span>Alternative Strategies & Cognitive Styles</span>
                              <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                                {activeMnemonic.alternativeMnemonics.length} Options
                              </span>
                            </span>
                            <motion.span
                              animate={{ rotate: alternativesExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-slate-400"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </motion.span>
                          </button>

                          <AnimatePresence initial={false}>
                            {alternativesExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="grid gap-6 pt-3"
                              >
                                {activeMnemonic.alternativeMnemonics.map((alt, idx) => (
                                  <AlternativeMnemonicCard
                                    key={idx}
                                    alt={alt}
                                    idx={idx}
                                    activeMnemonic={activeMnemonic}
                                    handleSelectAlternativeAsBest={handleSelectAlternativeAsBest}
                                    handleSaveMnemonicDetails={handleSaveMnemonicDetails}
                                  />
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Recreate button */}
                      <div className="flex justify-center pt-4">
                        <button
                          onClick={() => handleGenerate()}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 hover:border-blue-500/50 bg-white hover:bg-blue-50/50 px-6 py-3 text-xs font-bold text-slate-700 hover:text-blue-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-blue-950/20 dark:hover:text-blue-400 transition-all cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4 animate-spin-slow" />
                          Regenerate (Try Different Random Strategies)
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              key="history-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {storageWarning && (
                <div className="mb-4 rounded-xl border border-red-100 bg-red-50/50 p-3 text-xs font-semibold text-red-700 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{storageWarning}</span>
                </div>
              )}
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 dark:text-zinc-500 space-y-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold">Loading history...</span>
                </div>
              }>
                <HistorySidebar
                  history={history}
                  onSelectMnemonic={handleSelectFromHistory}
                  onDeleteMnemonic={handleDeleteMnemonic}
                  onTogglePin={handleTogglePin}
                  onToggleFavorite={handleToggleFavorite}
                  hasMore={hasMoreHistory}
                  onLoadMore={handleLoadMoreHistory}
                  isLoadingMore={isLoadingMoreHistory}
                  search={historySearch}
                  onSearchChange={setHistorySearch}
                  isSearchingFullHistory={isSearchingFullHistory}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === "favorites" && (
            <motion.div
              key="favorites-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 dark:text-zinc-500 space-y-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold">Loading favorites...</span>
                </div>
              }>
                <FavoritesGrid
                  history={favorites}
                  onSelectMnemonic={handleSelectFromHistory}
                  onToggleFavorite={handleToggleFavorite}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === "settings" && currentUser && (
            <motion.div
              key="settings-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 dark:text-zinc-500 space-y-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold">Loading settings...</span>
                </div>
              }>
                <SettingsTab currentUser={currentUser} onKeysChanged={refreshKeysState} selectedModel={selectedModel} />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Branding */}
        <footer className="mt-20 border-t border-slate-100 py-8 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-400 dark:text-slate-600 space-y-1">
            <p>© 2026 Memoraid. All medical information generated should be clinically verified prior to active treatment decisions.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

interface AlternativeMnemonicCardProps {
  alt: MnemonicDetails;
  idx: number;
  activeMnemonic: MnemonicResult;
  handleSelectAlternativeAsBest: (alternativeIdx: number) => Promise<void>;
  handleSaveMnemonicDetails: (updatedData: MnemonicDetails, alternativeIdx: number) => Promise<void>;
}

const AlternativeMnemonicCard = React.memo(function AlternativeMnemonicCard({
  alt,
  idx,
  activeMnemonic,
  handleSelectAlternativeAsBest,
  handleSaveMnemonicDetails,
}: AlternativeMnemonicCardProps) {
  const onSelectAsBest = useCallback(() => {
    handleSelectAlternativeAsBest(idx);
  }, [idx, handleSelectAlternativeAsBest]);

  const onSave = useCallback((updatedData: MnemonicDetails) => {
    handleSaveMnemonicDetails(updatedData, idx);
  }, [idx, handleSaveMnemonicDetails]);

  return (
    <MnemonicCard
      data={alt}
      title={`Alternative Mnemonic #${idx + 2}`}
      isBest={false}
      onSelectAsBest={onSelectAsBest}
      onSave={onSave}
      medicalText={activeMnemonic.medicalText}
    />
  );
});
