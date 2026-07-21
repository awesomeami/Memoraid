import React, { useState } from "react";
import { Brain, Sparkles, Loader2 } from "lucide-react";
import { auth, googleProvider, signInWithPopup, signInAnonymously, onAuthStateChanged } from "../lib/firebase";
import { motion } from "motion/react";

interface SignInScreenProps {
  onContinueAsGuest: () => void;
}

export default function SignInScreen({ onContinueAsGuest }: SignInScreenProps) {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(false);
  const [error, setError] = useState("");

  const handleGoogleSignIn = async () => {
    setError("");
    setLoadingGoogle(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setError(err.message || "Failed to sign in with Google. Please try again.");
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleGuestSignIn = async () => {
    setError("");
    setLoadingGuest(true);
    try {
      // Try to sign in anonymously in the background so they get a valid token
      await signInAnonymously(auth);

      // Ensure auth.currentUser is fully populated and non-null before continuing
      if (!auth.currentUser) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error("Guest session initialization timed out. Please try again."));
          }, 4000);

          const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
              clearTimeout(timeout);
              unsubscribe();
              resolve();
            }
          });
        });
      }

      onContinueAsGuest();
    } catch (err: any) {
      console.error("Anonymous auth error:", err);
      setError("Guest mode is temporarily unavailable because Anonymous Authentication is not enabled in the Firebase Console. Please Sign In with Google or ask the administrator to enable Anonymous Authentication.");
    } finally {
      setLoadingGuest(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 transition-colors duration-200 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Branding & Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40">
            <Brain className="h-10 w-10 text-blue-600 dark:text-blue-500" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Memoraid
          </h1>
          <p className="mt-2 text-sm text-slate-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
            Supercharge Your Medical Memory
          </p>
          <p className="mt-4 max-w-sm text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
            Convert complex medical concepts into highly memorable, professional-grade mnemonics. Sign in to save your history and study guides.
          </p>
        </div>

        {/* Info Box */}
        <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-zinc-950/40 dark:border-zinc-800/80">
          <div className="flex gap-2.5">
            <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Sync Across Devices
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Signing in securely stores your generated mnemonics, favorites, and pinned study cards so they are accessible anywhere.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-100 dark:bg-rose-950/10 dark:border-rose-950/20 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3.5">
          <button
            onClick={handleGoogleSignIn}
            disabled={loadingGoogle || loadingGuest}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 px-4 py-3 text-sm font-bold text-slate-700 dark:text-zinc-200 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {loadingGoogle ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 0, 0)">
                  <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.56h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.83 21.56,11.4 21.35,11.1z" fill="#4285F4" />
                  <path d="M12,20.6c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.56c-0.9,0.6 -2.07,0.98 -3.3,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.7H2.9v2.64C4.38,18.78 7.96,20.6 12,20.6z" fill="#34A853" />
                  <path d="M6.97,13.14a5.2,5.2 0 0 1 0,-3.28V7.22H2.9a10,10 0 0 0 0,9.56l4.07,-3.14c-0.18,-0.54 -0.27,-1.11 -0.27,-1.72z" fill="#FBBC05" />
                  <path d="M12,5.18c1.32,0 2.5,0.45 3.44,1.35l2.58,-2.58C16.46,2.44 14.43,1.4 12,1.4c-4.04,0 -7.62,1.82 -9.1,4.82l4.07,3.14c0.7,-2.12 2.69,-3.7 5.03,-3.7z" fill="#EA4335" />
                </g>
              </svg>
            )}
            <span>Sign in with Google</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-100 dark:border-zinc-800" />
            </div>
            <div className="relative bg-white px-3 text-xs text-slate-400 dark:bg-zinc-900 dark:text-zinc-500 font-medium">
              Or
            </div>
          </div>

          <button
            onClick={handleGuestSignIn}
            disabled={loadingGoogle || loadingGuest}
            className="flex w-full items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 px-4 py-3 text-xs font-bold text-slate-600 dark:text-zinc-300 transition-all cursor-pointer disabled:opacity-50"
          >
            {loadingGuest ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : null}
            <span>Continue without an Account</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
