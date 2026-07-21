import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, cert, App, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import firebaseConfig from "../firebase-applet-config.json";

import { MAX_MEDICAL_TEXT_LENGTH, DEFAULT_MODEL, PRO_MODEL } from "./types";

dotenv.config();

function getErrorStatus(error: any): number {
  const status = error?.status;
  if (typeof status === "number" && status >= 100 && status < 600) {
    return status;
  }
  const possibleCodes = [error?.code, error?.statusCode, error?.status_code, error?.error?.code];
  for (const code of possibleCodes) {
    if (typeof code === "number" && code >= 100 && code < 600) {
      return code;
    } else if (typeof code === "string") {
      const parsed = parseInt(code, 10);
      if (!isNaN(parsed) && parsed >= 100 && parsed < 600) {
        return parsed;
      }
    }
  }
  return 500;
}

function isQuotaExhaustedError(error: any): boolean {
  const numericStatus = getErrorStatus(error);
  
  // Check if there is an explicit status/code in the error object
  const hasExplicitStatus = 
    (typeof error?.status === "number" && error.status >= 100 && error.status < 600) ||
    [error?.code, error?.statusCode, error?.status_code, error?.error?.code].some(code => {
      if (typeof code === "number" && code >= 100 && code < 600) return true;
      if (typeof code === "string") {
        const parsed = parseInt(code, 10);
        return !isNaN(parsed) && parsed >= 100 && parsed < 600;
      }
      return false;
    });

  if (hasExplicitStatus) {
    return numericStatus === 429;
  }

  // Fallback to highly specific substring matching only if no explicit status code is found
  const errMessage = error?.message || String(error);
  return (
    errMessage.includes("RESOURCE_EXHAUSTED") ||
    errMessage.includes("Quota exceeded")
  );
}

function isServiceUnavailableError(error: any): boolean {
  const numericStatus = getErrorStatus(error);

  // Check if there is an explicit status/code in the error object
  const hasExplicitStatus = 
    (typeof error?.status === "number" && error.status >= 100 && error.status < 600) ||
    [error?.code, error?.statusCode, error?.status_code, error?.error?.code].some(code => {
      if (typeof code === "number" && code >= 100 && code < 600) return true;
      if (typeof code === "string") {
        const parsed = parseInt(code, 10);
        return !isNaN(parsed) && parsed >= 100 && parsed < 600;
      }
      return false;
    });

  if (hasExplicitStatus) {
    return numericStatus === 503;
  }

  // Fallback to highly specific substring matching only if no explicit status code is found
  const errMessage = error?.message || String(error);
  return (
    errMessage.includes("UNAVAILABLE") ||
    errMessage.includes("experiencing high demand")
  );
}

function isApiKeyError(error: any): boolean {
  const numericStatus = getErrorStatus(error);
  const errMessage = (error?.message || String(error)).toLowerCase();

  if (numericStatus === 403) {
    return true;
  }

  if (numericStatus === 400 && (
    errMessage.includes("api key") ||
    errMessage.includes("apikey") ||
    errMessage.includes("invalid key") ||
    errMessage.includes("key not valid") ||
    errMessage.includes("bad api key") ||
    errMessage.includes("credential")
  )) {
    return true;
  }

  return (
    errMessage.includes("api_key_invalid") ||
    errMessage.includes("api key not valid") ||
    errMessage.includes("permission denied") ||
    errMessage.includes("caller does not have permission") ||
    errMessage.includes("invalid api key") ||
    errMessage.includes("invalid key") ||
    errMessage.includes("key is invalid") ||
    errMessage.includes("revoked")
  );
}

// Initialize Firebase Admin SDK safely
export let firebaseAdminInitialized = false;
export let firebaseAdminInitError: string | null = null;
let firebaseProjectId = (firebaseConfig as any).projectId || "gen-lang-client-0565132992";
let firebaseApp: App | undefined = undefined;

try {
  if (getApps().length > 0) {
    console.log("Firebase Admin SDK already initialized. Using existing app instance...");
    firebaseApp = getApp();
    firebaseAdminInitialized = true;
  } else {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.log("Found FIREBASE_SERVICE_ACCOUNT_KEY environment variable. Initializing Firebase Admin with service account...");
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      firebaseApp = initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
      console.log(`No service account key found. Falling back to Application Default Credentials for project: ${firebaseProjectId}`);
      firebaseApp = initializeApp({
        projectId: firebaseProjectId
      });
    }
    firebaseAdminInitialized = true;
    console.log("Firebase Admin SDK initialized successfully.");
  }
} catch (adminError: any) {
  firebaseAdminInitError = adminError?.message || String(adminError);
  console.error("\n====================================================================");
  console.error("⚠️   CRITICAL: FIREBASE ADMIN SDK INITIALIZATION FAILED   ⚠️");
  console.error("====================================================================");
  console.error(`Error: ${firebaseAdminInitError}`);
  console.error("Auth features and database operations will not function correctly.");
  console.error("====================================================================\n");
}

// Helper to get Firestore instance with optional custom databaseId
function getDbInstance(): Firestore {
  if (!firebaseApp) {
    throw new Error("Firebase Admin SDK is not initialized.");
  }
  if ((firebaseConfig as any).firestoreDatabaseId) {
    return getFirestore(firebaseApp, (firebaseConfig as any).firestoreDatabaseId);
  }
  return getFirestore(firebaseApp);
}

/**
 * Firestore-based Rate Limiter for serverless environments.
 * Limits: 20 requests / 15 minutes on /validate-key, 100 requests / 15 minutes on /generate.
 */
async function checkRateLimit(userId: string, endpoint: "generate" | "validate-key" | "ocr", generationId?: string): Promise<{ limited: boolean; error?: string }> {
  if (!firebaseAdminInitialized || !firebaseApp) {
    return { limited: false };
  }

  const db = getDbInstance();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const limit = endpoint === "generate" ? 100 : endpoint === "ocr" ? 30 : 20;

  try {
    const docRef = db.collection("rate_limits").doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      
      let count = 0;
      let windowStart = now;
      let processedGenIds: string[] = [];

      if (docSnap.exists) {
        const data = docSnap.data();
        const storedCount = data?.[`${endpoint}_count`];
        const storedWindowStart = data?.[`${endpoint}_window_start`];
        processedGenIds = data?.[`${endpoint}_processed_gen_ids`] || [];

        if (typeof storedCount === "number" && typeof storedWindowStart === "number") {
          if (now - storedWindowStart < windowMs) {
            count = storedCount;
            windowStart = storedWindowStart;
          } else {
            // Window has expired, reset
            count = 0;
            windowStart = now;
            processedGenIds = [];
          }
        }
      }

      const alreadyProcessed = !!(generationId && processedGenIds.includes(generationId));

      if (!alreadyProcessed && count >= limit) {
        const remainingMinutes = Math.ceil((windowStart + windowMs - now) / 1000 / 60);
        return {
          limited: true,
          error: `Rate limit exceeded. You are allowed a maximum of ${limit} requests every 15 minutes on /${endpoint}. Please try again in ${remainingMinutes} minute(s).`
        };
      }

      const newCount = alreadyProcessed ? count : count + 1;
      let newProcessedGenIds = processedGenIds;
      if (generationId && !alreadyProcessed) {
        newProcessedGenIds = [...processedGenIds, generationId];
        if (newProcessedGenIds.length > 20) {
          newProcessedGenIds = newProcessedGenIds.slice(-20);
        }
      }

      // Increment and save atomically using transaction
      const expireDate = new Date(now + 24 * 60 * 60 * 1000);
      transaction.set(docRef, {
        [`${endpoint}_count`]: newCount,
        [`${endpoint}_window_start`]: windowStart,
        [`${endpoint}_processed_gen_ids`]: newProcessedGenIds,
        expireAt: Timestamp.fromDate(expireDate)
      }, { merge: true });

      return { limited: false };
    });

    return result;
  } catch (error) {
    console.error(`Rate limiting error on ${endpoint} for user ${userId}:`, error);
    // Fail open in case of firestore issues to avoid breaking the application
    return { limited: false };
  }
}

const app = express();

// Simple request logger middleware (method + path)
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  if (req.path === "/api/mnemonic/ocr-extract") {
    return next();
  }
  express.json({ limit: "5mb" })(req, res, next);
});

// GET /api/health endpoint to verify Firebase Admin initialization and Firestore reachability
app.get("/api/health", async (req, res) => {
  let firestoreReachable = false;
  if (firebaseAdminInitialized) {
    try {
      const db = getDbInstance();
      // Perform a lightweight Firestore read (limit 1) to verify connection/reachability
      await db.collection("health_check").limit(1).get();
      firestoreReachable = true;
    } catch (error) {
      console.error("Firestore reachability check failed during health check:", error);
    }
  }

  res.json({
    firebaseAdminInitialized,
    firebaseAdminInitError,
    firestoreReachable
  });
});

// API endpoint for validating user's Gemini key
app.post("/api/mnemonic/validate-key", async (req, res) => {
  try {
    const userGeminiKey = req.headers['x-user-gemini-key'];
    if (!userGeminiKey || typeof userGeminiKey !== "string" || !userGeminiKey.trim()) {
      return res.status(400).json({ error: "Gemini API Key is missing from the headers." });
    }

    const { modelToValidate = DEFAULT_MODEL } = req.body || {};

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid Authorization header." });
    }
    const token = authHeader.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token not provided." });
    }

    if (!firebaseAdminInitialized || !firebaseApp) {
      return res.status(500).json({ error: "Internal Server Error: Firebase Admin SDK is not initialized." });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth(firebaseApp).verifyIdToken(token);
    } catch (authError: any) {
      console.error("Firebase ID Token verification failed in validate-key:", authError);
      const errorCode = authError.code || (authError.errorInfo && authError.errorInfo.code) || "unknown";
      const errorMsg = authError.message || String(authError);
      return res.status(401).json({ 
        error: "Unauthorized: Invalid or expired Firebase ID token.",
        details: `Code: ${errorCode} - ${errorMsg}`
      });
    }

    const userId = decodedToken.uid;

    // Rate limiting check
    const rateCheck = await checkRateLimit(userId, "validate-key");
    if (rateCheck.limited) {
      return res.status(429).json({ error: rateCheck.error });
    }

    // Run a simple test call to verify the key.
    const testAi = new GoogleGenAI({
      apiKey: userGeminiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const testResponse = await testAi.models.generateContent({
      model: modelToValidate,
      contents: "Respond with exactly: OK",
    });

    if (!testResponse.text) {
      throw new Error("Empty response received from the test model.");
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("API Key Validation error:", error);
    
    const errMessage = error.message || String(error);
    const isQuotaExhausted = isQuotaExhaustedError(error);
    const isServiceUnavailable = isServiceUnavailableError(error);

    if (isQuotaExhausted || isServiceUnavailable) {
      return res.json({ 
        success: true, 
        warning: `The API key is structurally valid, but the Gemini API is currently busy or rate-limited: ${errMessage}. Key saved successfully.`
      });
    }

    res.status(400).json({ 
      error: "Invalid API key.", 
      details: error.message || String(error)
    });
  }
});

// API endpoint for mnemonic generation
app.post("/api/mnemonic/generate", async (req, res) => {
  try {
    // 1. Verify Firebase ID Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid Authorization header." });
    }
    const token = authHeader.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token not provided." });
    }

    if (!firebaseAdminInitialized || !firebaseApp) {
      return res.status(500).json({ error: "Internal Server Error: Firebase Admin SDK is not initialized." });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth(firebaseApp).verifyIdToken(token);
    } catch (authError: any) {
      console.error("Firebase ID Token verification failed in generate:", authError);
      const errorCode = authError.code || (authError.errorInfo && authError.errorInfo.code) || "unknown";
      const errorMsg = authError.message || String(authError);
      return res.status(401).json({ 
        error: "Unauthorized: Invalid or expired Firebase ID token.", 
        details: `Code: ${errorCode} - ${errorMsg}` 
      });
    }

    const userId = decodedToken.uid;
    const generationId = req.headers["x-generation-id"] as string | undefined;

    // Rate limiting check
    const rateCheck = await checkRateLimit(userId, "generate", generationId);
    if (rateCheck.limited) {
      return res.status(429).json({ error: "APP_RATE_LIMIT", details: rateCheck.error });
    }

    const userGeminiKey = req.headers['x-user-gemini-key'];
    if (!userGeminiKey || typeof userGeminiKey !== "string" || !userGeminiKey.trim()) {
      return res.status(400).json({ 
        error: "Your Gemini API Key is required to generate mnemonics. Please enter and save your key in the Settings tab." 
      });
    }

    const { medicalText, specialty, mnemonicStyle, selectedModel = DEFAULT_MODEL } = req.body;

    if (!medicalText || typeof medicalText !== "string" || !medicalText.trim()) {
      return res.status(400).json({ error: "Medical text or concept is required." });
    }

    // Server-side input length validation
    if (medicalText.length > MAX_MEDICAL_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Input text length of ${medicalText.length} characters exceeds the maximum allowed limit of ${MAX_MEDICAL_TEXT_LENGTH} characters.`
      });
    }

    // Create on-demand Gemini client
    const requestAi = new GoogleGenAI({
      apiKey: userGeminiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    // Construct system instruction that enforces strict medical quality rules
    const systemInstruction = `You are an expert medical education specialist, clinical tutor, and cognitive learning scientist. 
Your goal is to convert complex medical information, textbook content, lists, symptoms, or drug classifications into highly memorable, professional-grade mnemonics for medical, nursing, and pharmacy students.

A great mnemonic is optimized for long-term retention, clinical accuracy, and ease of cognitive recall. Follow these priority-ordered rules strictly:

1. PRIORITY 1: REAL ENGLISH WORDS. Create actual English words whenever possible (e.g., SMART, CATCH, SALT, BRAIN, SHOCK, FAST, LEAP, ABCDE, STAMP, CLEAR). These are infinitely easier to remember than random letter soup.
2. PRIORITY 2: PRONOUNCEABLE PSEUDO-WORDS. If a real word cannot be formed, create a highly pronounceable pseudo-word that sounds like a natural word (e.g., MELTOR, CRAVEN, LUPAS, TRENIC). Avoid awkward, unpronounceable letter combinations.
3. PRIORITY 3: SINGLE WORDS > SENTENCES. Single-word acronyms or short words are strongly preferred over long, clunky sentences. Avoid sentence mnemonics unless requested or as a last-resort alternative.
4. PRIORITY 4: CONCEPT INTUITIVENESS. The mnemonic should feel intuitive and immediately remind the user of the target disease, organ, or medical system.
5. PRIORITY 5: NO FORCED ACRONYMS. Never force an awkward, confusing acronym. If a poor acronym is the only option, select an alternative mnemonic style (e.g., visual metaphor, vivid association, rhyming, or anatomical story).
6. PRIORITY 6: SPLIT LARGE LISTS. If there are too many clinical facts (more than 6 or 7), do NOT build a giant impossible acronym. Instead, group them logically (e.g., by pathology, symptom class, or system) and generate separate, bite-sized mnemonics.
7. PRIORITY 7: RIGOROUS MEDICAL ACCURACY. Never invent, hallucinate, or alter medical facts. If some detail is omitted for simplification, explain why clearly.
8. PRIORITY 8: ABSOLUTELY NO MARKDOWN FORMATTING IN SPECIFIC FIELDS. The fields "whyItWorks" and "expansion.details" MUST be returned as clean, plain text with absolutely no markdown syntax. Do NOT use asterisks for bold or italics (e.g. no **word** or *word*), do NOT use dashes or asterisks for list items (no bullet points like - item or * item), do NOT use hashtags/headers (no #), and do NOT use backticks. Write these fields entirely as standard conversational prose and plain paragraphs.

ABBREVIATION COLLISION WARNING: Avoid colliding with other well-known clinical abbreviations unrelated to the topic at hand. For example, never use "MI" to represent "Muscle Insufficiency" or "Muscle Illness" in a cardiology or neuromuscular context, because "MI" is globally understood as "Myocardial Infarction". Using established abbreviations in different contexts causes dangerous clinical confusion.

FEW-SHOT EXAMPLES OF PRIORITY-ORDERED MNEMONICS:

Example 1: Priority 1 (Real English Word)
- Input Clinical Snippet: "Multiple Myeloma clinical features: Calcium elevation, Renal insufficiency, Anemia, Bone pain."
- Ideal Mnemonic Chosen: "CRAB"
- Expansion:
  * C: Calcium elevation (hypercalcemia due to bone destruction)
  * R: Renal insufficiency (kidney damage from light chains)
  * A: Anemia (normocytic anemia due to bone marrow infiltration)
  * B: Bone pain (lytic lesions, especially in the spine and ribs)

Example 2: Priority 2 (Pronounceable Pseudo-Word)
- Input Clinical Snippet: "Manifestations of Acute Pancreatitis: Abdominal pain, Vomiting, Fever, Tachycardia, Leukocytosis."
- Ideal Mnemonic Chosen: "TAVEL" (sounds like the natural name 'Tavel')
- Expansion:
  * T: Tachycardia (elevated heart rate due to systemic inflammation or pain)
  * A: Abdominal pain (severe epigastric pain radiating to the back)
  * V: Vomiting (frequently accompanied by severe nausea)
  * E: Elevated temperature (fever indicating systemic inflammatory response)
  * L: Leukocytosis (high white blood cell count indicating inflammation)

CONCRETE NEGATIVE EXAMPLE:
- Input Clinical Snippet: "Clinical signs of Myasthenia Gravis: Ptosis, Diplopia, Dysphagia, Muscle weakness, Fatigability."
- Awkward, Forced Mnemonic to AVOID: "PDDMF" (Fails Priority 1 and 2 because it is an unpronounceable letter soup with zero visual/verbal memory anchors, and forcing "MI" to stand for "Muscle Illness" causes collision with Myocardial Infarction).

For the given medical concept, you must:
1. Formulate the single best main mnemonic (the Winner ⭐).
2. Expand each letter or element in detail, providing the clinical concept and a helpful explanation.
3. Explain why the mnemonic is good for the clinical information pasted and why it works cognitively (returned in "whyItWorks").
4. Provide exactly one alternative mnemonic of high quality (this can be a different acronym or alternative style like visual association, stories, or grouping schemas).`;

    // Prompt for the model
    const userPrompt = `Generate a set of premium medical mnemonics for the following medical content:
${specialty ? `Specialty/Field: ${specialty}` : ""}
Content:
"${medicalText}"

${mnemonicStyle ? `Preferred Mnemonic Style Constraint: ${mnemonicStyle}` : ""}

You must return a structured JSON response matching the required schema. Ensure the response is highly detailed, rich in clinical value, and well-organized. Use PLAIN CONVERSATIONAL PROSE without any markdown syntax (no asterisks, bullet dashes, or headers) in "whyItWorks" and "expansion.details" fields.`;

    // Define the response schema using @google/genai Type definitions
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        bestMnemonic: {
          type: Type.OBJECT,
          properties: {
            mnemonic: { type: Type.STRING, description: "The core mnemonic word or phrase (e.g., 'LEAP')." },
            strategyUsed: { type: Type.STRING, description: "The technique used (e.g., 'English Word Acronym', 'Pronounceable Pseudo-word', 'Visual Analogy')." },
            expansion: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  letter: { type: Type.STRING, description: "The corresponding letter or trigger in the mnemonic." },
                  concept: { type: Type.STRING, description: "The medical concept/fact mapping to this letter (e.g., 'Proteinuria')." },
                  details: { type: Type.STRING, description: "Brief clinical context or diagnostic criteria explaining the fact." }
                },
                required: ["letter", "concept"]
              },
              description: "The component-by-component expansion of the mnemonic."
            },
            whyItWorks: { type: Type.STRING, description: "Cognitive science explanation of why this mnemonic is easy to recall and good for the clinical info." },
            memorabilityScore: { type: Type.INTEGER, description: "A score from 1 (poor) to 10 (perfect) evaluating recall difficulty." }
          },
          required: ["mnemonic", "strategyUsed", "expansion", "whyItWorks", "memorabilityScore"]
        },
        alternativeMnemonics: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              mnemonic: { type: Type.STRING },
              strategyUsed: { type: Type.STRING },
              expansion: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    letter: { type: Type.STRING },
                    concept: { type: Type.STRING },
                    details: { type: Type.STRING }
                  },
                  required: ["letter", "concept"]
                }
              },
              whyItWorks: { type: Type.STRING },
              memorabilityScore: { type: Type.INTEGER }
            },
            required: ["mnemonic", "strategyUsed", "expansion", "whyItWorks", "memorabilityScore"]
          },
          description: "Exactly one high-quality alternative mnemonic option, using different words, groups, or memory techniques."
        }
      },
      required: ["bestMnemonic", "alternativeMnemonics"]
    };

    let response: any = null;
    let attempts = 0;
    const maxAttempts = 3;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      try {
        attempts++;
        response = await requestAi.models.generateContent({
          model: selectedModel,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema
          }
        });
        break; // Success, break retry loop
      } catch (geminiError: any) {
        const isUnavailable = isServiceUnavailableError(geminiError);

        if (isUnavailable && attempts < maxAttempts) {
          const backoffMs = attempts === 1 ? 1000 : 2000;
          console.warn(`Gemini API 503/UNAVAILABLE error encountered (attempt ${attempts}/${maxAttempts}). Retrying in ${backoffMs}ms... Error:`, geminiError.message || geminiError);
          await delay(backoffMs);
        } else {
          throw geminiError;
        }
      }
    }

    if (!response) {
      throw new Error("No response received from Gemini model after maximum attempts.");
    }

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response received from Gemini model.");
    }

    let result;
    try {
      result = JSON.parse(responseText.trim());
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", parseError, "Raw response was:", responseText);
      return res.status(500).json({
        error: "Failed to generate mnemonics.",
        details: "The AI returned an unexpected response format. Please try again."
      });
    }
    res.json(result);

  } catch (error: any) {
    console.error("Mnemonic generation error:", error);
    const errMessage = error.message || String(error);
    const numericStatus = getErrorStatus(error);

    const isQuotaExhausted = isQuotaExhaustedError(error);
    const isServiceUnavailable = isServiceUnavailableError(error);

    if (isQuotaExhausted) {
      return res.status(429).json({
        error: "RESOURCE_EXHAUSTED",
        details: errMessage
      });
    }

    if (isServiceUnavailable) {
      return res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        details: "The Gemini API is currently experiencing very high demand. Spikes in demand are usually temporary. Please try again in a few moments, or select a different model in Settings if this persists."
      });
    }

    const isKeyError = isApiKeyError(error);
    if (isKeyError) {
      return res.status(numericStatus === 500 ? 400 : numericStatus).json({
        error: "GEMINI_KEY_ERROR",
        details: errMessage
      });
    }

    res.status(numericStatus).json({ 
      error: "Failed to generate mnemonics.", 
      details: errMessage
    });
  }
});

// API endpoint for OCR text extraction from images
app.post("/api/mnemonic/ocr-extract", express.json({ limit: "15mb" }), async (req, res) => {
  try {
    // 1. Verify Firebase ID Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid Authorization header." });
    }
    const token = authHeader.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token not provided." });
    }

    if (!firebaseAdminInitialized || !firebaseApp) {
      return res.status(500).json({ error: "Internal Server Error: Firebase Admin SDK is not initialized." });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth(firebaseApp).verifyIdToken(token);
    } catch (authError: any) {
      console.error("Firebase ID Token verification failed in ocr-extract:", authError);
      const errorCode = authError.code || (authError.errorInfo && authError.errorInfo.code) || "unknown";
      const errorMsg = authError.message || String(authError);
      return res.status(401).json({ 
        error: "Unauthorized: Invalid or expired Firebase ID token.", 
        details: `Code: ${errorCode} - ${errorMsg}` 
      });
    }

    const userId = decodedToken.uid;

    // Rate limiting check (limit 30 requests per 15 mins) - remains 1 check per request (multiple images counts as 1 request against ocr limit)
    const rateCheck = await checkRateLimit(userId, "ocr");
    if (rateCheck.limited) {
      return res.status(429).json({ error: "APP_RATE_LIMIT", details: rateCheck.error });
    }

    // Require X-User-Gemini-Key header
    const userGeminiKey = req.headers['x-user-gemini-key'];
    if (!userGeminiKey || typeof userGeminiKey !== "string" || !userGeminiKey.trim()) {
      return res.status(400).json({ 
        error: "Your Gemini API Key is required to extract text from images. Please enter and save your key in the Settings tab." 
      });
    }

    const { images } = req.body || {};

    if (!images || !Array.isArray(images) || images.length === 0 || images.length > 3) {
      return res.status(400).json({ error: "images array is required and must contain 1-3 images." });
    }

    const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || typeof img !== "object") {
        return res.status(400).json({ error: `Image at index ${i} is invalid.` });
      }
      if (!img.imageBase64 || typeof img.imageBase64 !== "string") {
        return res.status(400).json({ error: `imageBase64 is required and must be a string for image at index ${i}.` });
      }
      if (!img.mimeType || typeof img.mimeType !== "string" || !validMimeTypes.includes(img.mimeType)) {
        return res.status(400).json({ error: `Invalid mimeType for image at index ${i}. Allowed types: image/jpeg, image/png, image/webp` });
      }

      // Reject if the decoded payload exceeds 8MB
      const decodedBuffer = Buffer.from(img.imageBase64, 'base64');
      const maxBytes = 8 * 1024 * 1024; // 8MB
      if (decodedBuffer.length > maxBytes) {
        return res.status(413).json({ error: `Payload Too Large: Image at index ${i} exceeds the 8MB limit.` });
      }
    }

    // Create on-demand Gemini client
    const requestAi = new GoogleGenAI({
      apiKey: userGeminiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const promptText = `Transcribe all readable text from each image exactly as written.
Process the images in the exact order given.
Preserve medical terminology, drug names, numbers, units, and abbreviations precisely — do not paraphrase or correct anything.
Output plain text only, no markdown, no commentary.
Separate each image's transcription with the exact literal line "---MEMORAID_PAGE_BREAK---" on its own line.
If there is no readable text in a given image, output exactly: NO_TEXT_FOUND
for that image rather than skipping it.`;

    // Call generateContent using DEFAULT_MODEL with multimodal contents containing all images in order
    const contents = [
      ...images.map((img: any) => ({
        inlineData: { mimeType: img.mimeType, data: img.imageBase64 }
      })),
      { text: promptText }
    ];

    const modelResponse = await requestAi.models.generateContent({
      model: DEFAULT_MODEL,
      contents
    });

    const modelOutput = modelResponse.text;
    const rawText = modelOutput ? modelOutput.trim() : "";

    // Parse the response by splitting on the exact separator
    const sections = rawText.split("---MEMORAID_PAGE_BREAK---");
    const trimmedSections = sections.map(s => s.trim());

    if (trimmedSections.length !== images.length) {
      console.warn(`OCR parse error: Expected ${images.length} sections, but parsed ${trimmedSections.length}. Output:`, rawText);
      return res.status(502).json({ error: "OCR_PARSE_ERROR" });
    }

    const pages = trimmedSections.map((extractedText, index) => ({
      index,
      extractedText
    }));

    return res.json({ pages });

  } catch (error: any) {
    console.error("OCR extraction error:", error);
    const errMessage = error.message || String(error);
    const numericStatus = getErrorStatus(error);

    const isQuotaExhausted = isQuotaExhaustedError(error);
    const isServiceUnavailable = isServiceUnavailableError(error);

    if (isQuotaExhausted) {
      return res.status(429).json({
        error: "RESOURCE_EXHAUSTED",
        details: errMessage
      });
    }

    if (isServiceUnavailable) {
      return res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        details: "The Gemini API is currently experiencing very high demand. Spikes in demand are usually temporary. Please try again in a few moments, or select a different model in Settings if this persists."
      });
    }

    const isKeyError = isApiKeyError(error);
    if (isKeyError) {
      return res.status(numericStatus === 500 ? 400 : numericStatus).json({
        error: "GEMINI_KEY_ERROR",
        details: errMessage
      });
    }

    res.status(numericStatus).json({ 
      error: "Failed to extract text from image.", 
      details: errMessage
    });
  }
});

// Safety-net for all unmatched /api/* routes
export const apiSafetyNet = (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "API route not found" });
};

app.all("/api/*", apiSafetyNet);

export { app };
