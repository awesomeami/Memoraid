# Memoraid 🧠✨
### The Intelligent AI-Powered Medical Mnemonic Generator

**Memoraid** is a state-of-the-art full-stack educational companion designed for medical students, nursing students, pharmacy students, residents, and healthcare professionals. By combining **clinical precision** with **cognitive learning science**, the application converts dense medical facts, symptoms, drug classes, or diagnostic guidelines into highly structured, intuitive, and long-term memorable study guides.

---

## 🚀 Core Features

- **Clinical Input Processor:** Paste textbook paragraphs, drug profiles, symptomatology lists, or physiological pathways. You can now even import photos of the medical material you want mnemonics to be generated for and the app will extract the text for you and use it as the input.
- **Cognitive Strategy Pipeline:** Prioritizes real English words over random acronyms. Follows an 8-tier cognitive strategy rule system (word alignments, phonetic pseudo-words, visual stories, anatomical metaphors).
- **Extracted Key Facts Module:** Extracts, simplifies, and validates strictly accurate physiological and pathological criteria so you don't miss key concepts.
- **Best Mnemonic (Winner ⭐) & Alternative Strategies:** Recommends the highest-yielding mnemonic accompanied by dual high-quality alternatives using distinct memory techniques (visual analogies, anatomic stories, etc.).
- **Interactive Memorability Score Gauges:** Every mnemonic features a 1–10 clinical gauge rating pronunciation ease, simplicity, and visual impact.
- **Custom Memory Trick Imagery:** Delivers detailed, humorous, or highly sensory scenes designed to lock the mnemonic in your long-term mental files.
- **Copy & Download Controls:** Copy study notes instantly, or download formatted **Markdown (.md)** files to import directly into Obsidian, Notion, or Anki.
- **History & Pinned Guides:** Search and filter your local study archive by keywords or specific medical specialties (Pharmacology, Anatomy, Cardiology, etc.). Pin high-yield notes to the top.
- **Saved Favorites Repository:** Separate bookmark registry for rapid active-recall revision.
- **Polished Responsive Design:** Sleek medical-themed UI with fluid layout transitions and fully supported **Light Mode** & **Dark Mode**.

---

## 🛠️ Technology Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, and Motion animations.
- **Backend:** Express, Node.js, TypeScript, and standard `.env` configuration.
- **AI Core:** Google Gemini API using the modern `@google/genai` TypeScript SDK (supporting `gemini-3.5-flash` for blazing-fast generations and `gemini-3.1-pro-preview` for deep clinical synthesis).
- **Local Persistence:** Synchronization with browser `localStorage` ensuring your study archives, favorites, search indexes, and pins survive restarts.

---

## 📁 File Structure

```text
/
├── server.ts               # Express Entry point with Vite middleware and API routes
├── package.json            # Scripts, dependency versions, and metadata configuration
├── metadata.json           # Application identity and major capabilities configurations
├── index.html              # Core HTML SPA layout
├── tsconfig.json           # Strict TypeScript configuration
├── vite.config.ts          # Vite asset server and environment configurations
└── src/
    ├── App.tsx             # Main React application orchestration and state managers
    ├── main.tsx            # Main frontend entry point
    ├── index.css           # Global Tailwind and webfont typography pairings
    ├── types.ts            # Type-safe clinical schemas and specialty static lists
    └── components/
        ├── Header.tsx      # Dashboard navigation, tab triggers, and dark mode toggles
        ├── HeroSection.tsx # Landing introduction and interactive clinical presets
        ├── MnemonicCard.tsx# Detailed mnemonic visual layout, copy/download, and scoring
        ├── HistorySidebar.tsx# Archive search, filtering, pin groups, and mini item templates
        └── FavoritesGrid.tsx# Bookmarked collection with markdown exporters
```

---

## 🔑 Environment Configuration

To run the application, configure your secrets inside `.env` or in your hosting environment:

```env
# Google Gemini API key used for the server-side proxy
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# The deployment base URL
APP_URL="http://localhost:3000"

# (Optional / Required on Vercel) Firebase Admin Service Account JSON credentials.
# Value should be the entire JSON string on a single line.
# Generate this value in the Firebase Console: Project Settings -> Service Accounts -> Generate new private key.
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", ...}'
```

*Note: In the Google AI Studio build sandbox, your secret is automatically injected from the Secrets sidebar.*

---

## 🖥️ Local Installation & Running

1. **Install Base Dependencies:**
   ```bash
   npm install
   ```

2. **Boot the Development Server:**
   ```bash
   npm run dev
   ```
   The application will run on [http://localhost:3000](http://localhost:3000) inside your local environment.

3. **Verify Code Quality (Linting):**
   ```bash
   npm run lint
   ```

---

## 🚢 Production Build & Deployment

To bundle the application for production or container deployment (e.g., Cloud Run):

1. **Build the Application:**
   ```bash
   npm run build
   ```
   This compiles the React frontend to static assets inside `dist/` and bundles the Express backend server into a single, self-contained CommonJS file (`dist/server.cjs`) using `esbuild`.

2. **Start the Production App:**
   ```bash
   npm run start
   ```

3. **Docker Deployment:**
   Deploy using standard Node.js base images, ensuring port `3000` is exposed:
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

4. **Vercel Serverless Deployment:**
   - Because Vercel is a serverless environment, the application is refactored to support stateless function executions:
     - **Vite Frontend:** Compiled statically and served automatically from `/dist`.
     - **Express Backend:** Executed on-demand as a serverless function inside `/api/index.ts`. All `/api/*` endpoints are dynamically routed to this function via `vercel.json`.
     - **Duration Limit:** The `vercel.json` configures the `maxDuration` parameter to `60` seconds for the `/api` functions to ensure structured JSON responses from Gemini have ample time to complete.
     - **Configuration Steps:**
       1. Connect your GitHub repository containing this codebase to Vercel.
       2. Go to your project Settings -> Environment Variables.
       3. (Not required on Vercel: users securely configure their own key via Settings)
       4. Add `FIREBASE_SERVICE_ACCOUNT_KEY` (the complete JSON string of your Firebase service account key, allowing the serverless environment to verify credentials without local Application Default Credentials).
       5. Deploy! Vercel's zero-config will automatically run `npm run build` and provision the frontend static assets and serverless functions correctly.
      - **⚠️ Firebase Authorized Domains Callout:** You must add your deployed Vercel domain (as well as any custom domain you associate with the project) to **Firebase Console → Authentication → Settings → Authorized domains**. If you omit this step, Google Sign-In attempts will fail with an `unauthorized-domain` error.
      - **⏱️ Serverless Function Timeout Callout:** Make sure that the actual serverless function execution timeout allowed on your Vercel plan matches or exceeds the `60` seconds `maxDuration` parameter specified in `vercel.json` (Hobby plans default to a 10s limit and require special configuration or upgrades, while Pro/Enterprise support up to 300s). Because Gemini Pro-model requests and automatic multi-key sequential retry backoffs can occasionally run long, an inadequate function timeout will lead to premature truncation of the stream.

---
*Created with clinical precision using Google Gemini cognitive inference. Dedicated to medical education excellence.*
