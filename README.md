# Memoraid 🧠✨
### The Intelligent AI-Powered Medical Mnemonic Generator

**Memoraid** is a full-stack educational companion for medical students, nursing students, pharmacy students, residents, and healthcare professionals. It converts dense medical facts, symptoms, drug classes, or diagnostic guidelines into structured, memorable study guides — either by pasting text directly or by uploading a photo of the source material.

---

## 🚀 Core Features

- **Clinical Input Processor:** Paste textbook paragraphs, drug profiles, symptomatology lists, or physiological pathways directly into the input box.
- **Photo Import & OCR:** Upload or snap up to 3 photos (JPEG, PNG, or WebP) of textbook pages, slides, or handwritten notes. Memoraid transcribes the readable text from each image and drops it straight into the input box, ready to generate from — no manual retyping.
- **Cognitive Strategy Pipeline:** Follows an 8-tier, priority-ordered rule system — real-word acronyms first, then pronounceable pseudo-words, then visual/anatomical storytelling styles — so mnemonics stay natural instead of forced letter soup.
- **Best Mnemonic (Winner ⭐) + One Alternative:** Every generation returns a top-recommended mnemonic plus one high-quality alternative using a different memory technique, so you have a fallback if the first doesn't click.
- **Interactive Memorability Score:** Each mnemonic gets a 1–10 clinical gauge rating pronunciation ease, simplicity, and recall strength.
- **Flexible Export:** Copy to clipboard, export as Markdown (for Obsidian/Notion), export as an Anki-ready text file, or download as a PDF or PNG card.
- **History & Pinned Guides:** Search and filter your study archive by keyword or medical specialty (Pharmacology, Anatomy, Cardiology, etc.), and pin high-yield notes to the top.
- **Saved Favorites Repository:** A separate bookmark list for rapid active-recall revision.
- **Google Sign-In with Cross-Device Sync:** Sign in to sync your history and favorites via Firestore, or continue as a guest with local-only storage.
- **Bring-Your-Own-Key, with Automatic Rotation:** Add up to 5 personal Gemini API keys in Settings. If one hits a rate limit, Memoraid automatically retries with the next key instead of failing the request.
- **Polished Responsive Design:** Medical-themed UI with Light Mode and Dark Mode.

---

## 🛠️ Technology Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, and Motion animations.
- **Backend:** Express, Node.js, TypeScript.
- **AI:** Google Gemini API via the `@google/genai` SDK — model and API key are user-configurable in Settings.
- **Auth & Storage:** Firebase Authentication (Google Sign-In + anonymous guest mode) and Firestore, with local `localStorage` persistence as a fallback/cache.

---

## 📁 File Structure

```text
/
├── server.ts                    # Express entry point with Vite middleware (local/Docker)
├── api/index.ts                 # Serverless entry point (Vercel)
├── package.json                 # Scripts, dependency versions, and metadata
├── metadata.json                # Application identity configuration
├── index.html                   # Core HTML SPA layout
├── tsconfig.json                # Strict TypeScript configuration
├── vite.config.ts               # Vite build and dev-server configuration
├── vercel.json                  # Vercel routing, headers, and function config
├── firebase-applet-config.json  # Public Firebase web app config (client-side)
├── firestore.rules              # Per-user Firestore access rules
└── src/
    ├── App.tsx                  # Main application state and orchestration
    ├── main.tsx                 # Frontend entry point
    ├── index.css                # Global Tailwind styles
    ├── types.ts                 # Shared types, model constants, specialty lists
    ├── server-app.ts            # Express app: Gemini proxy, OCR, auth, rate limiting
    ├── lib/
    │   ├── firebase.ts          # Firebase client SDK setup (auth + Firestore)
    │   └── db.ts                # Firestore read/write helpers for mnemonics
    └── components/
        ├── Header.tsx           # Navigation, tab triggers, dark mode toggle
        ├── HeroSection.tsx      # Landing intro and clinical presets
        ├── SignInScreen.tsx     # Google Sign-In / guest entry screen
        ├── SettingsTab.tsx      # Gemini API key management and model selection
        ├── MnemonicCard.tsx     # Mnemonic display, scoring, and export controls
        ├── HistorySidebar.tsx   # Archive search, filtering, and pin groups
        └── FavoritesGrid.tsx    # Bookmarked collection view
```

---

## 🔑 Environment Configuration

### Model lifecycle and reliability

The browser saves a model family (`flash`, `flash-lite`, or `pro`). Old saved model IDs
are migrated automatically, including requests from tabs opened before a deployment.
Generation, OCR, and key validation use the same server-side resolver. OCR now follows
the selected family instead of always using the default Flash model.

Flash uses **`gemini-flash-latest`** and Flash-Lite uses **`gemini-flash-lite-latest`**.
Google maintains these aliases, so normal model-version changes need no code edits.
Pro retains `gemini-3.1-pro-preview`. Each backend request makes **one Gemini call**:
there is no model listing, discovery, fallback chain, or SDK retry.

The Gemini call has a maximum 45-second timeout, reduced if authentication or rate-limit
checks have used time from a 50-second request deadline. This leaves headroom below the
60-second function limit configured in `vercel.json`. The browser times out each generation
or OCR request after 55 seconds. Upstream model outages and timeouts stop promptly with a
service error, rather than trying the same unavailable model on every saved key.

On quota or invalid-key errors, the browser tries the next configured key in a **new HTTP
request**. Each key is tried at most once, starting at the last successful slot. The same
generation ID is retained so automatic retries count as one generation for the app's rate
limit. Authentication failures and application rate limits stop rotation. Successful results
record the concrete model version returned by Google when available.

For a tested rollout or rollback, optionally set `GEMINI_FLASH_MODEL`,
`GEMINI_FLASH_LITE_MODEL`, or `GEMINI_PRO_MODEL` to **one** model ID from that family in
Vercel (examples in `.env.example`). Redeploy after changing an environment variable.
No source edit is needed for these overrides.

Google's [latest aliases](https://ai.google.dev/gemini-api/docs/models#model-versions)
can move to stable, preview, or experimental releases; behavior, price, and key access can
change. Aliases reduce version maintenance but cannot guarantee future compatibility or
availability. Use a pin if a release needs rollback. Generated study-guide structure is
validated before saving; this does not independently verify clinical facts.

Run `npm test` for alias selection, time budgets, key rotation, API integration, and React flow tests.
The test suite mocks Gemini and Firebase: it never consumes real API quota or changes cloud data.

Configure these inside `.env` (local) or your hosting provider's environment variables:

```env
# Only used in the AI Studio sandbox environment — NOT used in production,
# since users provide their own personal Gemini API key in the Settings tab.
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# The deployment base URL.
APP_URL="http://localhost:3000"

# Required for non-GCP hosting (e.g. Vercel). Generate in Firebase Console:
# Project Settings -> Service Accounts -> Generate new private key.
# Value should be the entire JSON string on a single line.
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", ...}'
```

---

## 🖥️ Local Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```
   Runs at [http://localhost:3000](http://localhost:3000).

3. **Type-check:**
   ```bash
   npm run lint
   ```

---

## 🚢 Production Build & Deployment

**Build:**
```bash
npm run build
```
Compiles the frontend to `dist/` and bundles the Express backend into `dist/server.cjs` via esbuild (used for standalone/Docker deployments — not needed on Vercel, which builds `api/index.ts` separately).

**Run:**
```bash
npm run start
```

**Docker:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

**Vercel:**
1. Connect your GitHub repository to Vercel.
2. In Project Settings → Environment Variables, add `FIREBASE_SERVICE_ACCOUNT_KEY`.
3. Deploy — Vercel installs with `npm ci` using `package-lock.json`, runs `npm run build`, and builds `api/index.ts` as a serverless function automatically. All `/api/*` routes are rewritten to it, with a 60-second `maxDuration`. The explicit install command avoids selecting the older AI Studio `bun.lock`.

**Known gotchas:**
- **Authorized domains:** Add your Vercel domain (and any custom domain) to Firebase Console → Authentication → Settings → Authorized domains, or Google Sign-In will fail.
- **Function timeout:** This project sets `maxDuration` to 60 seconds. Gemini calls are capped at 45 seconds; quota-driven key rotation uses separate function invocations. Actual platform limits also depend on your Vercel project settings.
- **Request size limit:** Vercel Functions cap request bodies at 4.5MB. The photo OCR feature compresses images client-side before upload, but very large or numerous photos can still approach this ceiling.
