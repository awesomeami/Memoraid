import React from "react";
import { ActiveTab } from "../types";
import { Brain, History, Star, Plus, Sun, Moon, LogOut, LogIn, User as UserIcon, Settings } from "lucide-react";
import { User, auth, signOut, googleProvider, signInWithPopup } from "../lib/firebase";

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  favoritesCount: number;
  historyCount: number;
  currentUser: User | null;
}

export default function Header({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  favoritesCount,
  historyCount,
  currentUser,
}: HeaderProps) {
  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand Logo & Name */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-black via-slate-900 to-blue-600 p-2 shadow-md shadow-blue-500/10">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-display text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                Memoraid
              </span>
            </div>
          </div>

          {/* Tab Navigation Controls */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <nav className="scrollbar-none hidden sm:flex min-w-0 shrink space-x-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-zinc-900">
              <button
                onClick={() => setActiveTab("generate")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 text-xs font-semibold transition-all ${
                  activeTab === "generate"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Generate</span>
              </button>

              <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 text-xs font-semibold transition-all ${
                  activeTab === "history"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">History</span>
                {historyCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-zinc-700 dark:text-zinc-300">
                    {historyCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("favorites")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 text-xs font-semibold transition-all ${
                  activeTab === "favorites"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Star className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Favorites</span>
                {favoritesCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-blue-950/40 dark:text-blue-400">
                    {favoritesCount}
                  </span>
                )}
              </button>

              {currentUser && (
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 text-xs font-semibold transition-all ${
                    activeTab === "settings"
                      ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
              )}
            </nav>

            <span className="mx-1.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-zinc-800" />

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors mr-1"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* User auth controls */}
            {currentUser && (
              <div className="flex shrink-0 items-center gap-2">
                {currentUser.isAnonymous ? (
                  <div className="flex items-center gap-1.5">
                    <span className="hidden md:inline rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-1 text-[10px] font-bold">
                      Guest Mode
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await signInWithPopup(auth, googleProvider);
                        } catch (error) {
                          console.error("Error signing in with Google:", error);
                        }
                      }}
                      className="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      title="Sign In with Google"
                      aria-label="Sign In with Google"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Sign In</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt={currentUser.displayName || "User"}
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 rounded-full border border-slate-200 dark:border-zinc-800"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300">
                          {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : <UserIcon className="h-3.5 w-3.5" />}
                        </div>
                      )}
                      <span className="hidden lg:inline text-xs font-semibold text-slate-600 dark:text-zinc-300 max-w-[100px] truncate">
                        {currentUser.displayName || currentUser.email}
                      </span>
                    </div>
                    <button
                      onClick={() => signOut(auth)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Sign Out"
                      aria-label="Sign Out"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-100 bg-white/95 backdrop-blur-md px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950/95 shadow-lg shadow-black/5">
        <button
          onClick={() => setActiveTab("generate")}
          className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-all cursor-pointer ${
            activeTab === "generate"
              ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
              : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 font-semibold"
          }`}
        >
          <Plus className="h-5 w-5" />
          <span className="text-[10px]">Generate</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all cursor-pointer ${
            activeTab === "history"
              ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
              : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 font-semibold"
          }`}
        >
          <History className="h-5 w-5" />
          <span className="text-[10px]">History</span>
          {historyCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[8px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-white dark:border-zinc-900">
              {historyCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("favorites")}
          className={`relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all cursor-pointer ${
            activeTab === "favorites"
              ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
              : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 font-semibold"
          }`}
        >
          <Star className="h-5 w-5" />
          <span className="text-[10px]">Favorites</span>
          {favoritesCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-100 px-1 text-[8px] font-bold text-rose-700 dark:bg-blue-950/40 dark:text-blue-400 border border-white dark:border-zinc-900">
              {favoritesCount}
            </span>
          )}
        </button>

        {currentUser && (
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-all cursor-pointer ${
              activeTab === "settings"
                ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 font-semibold"
            }`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px]">Settings</span>
          </button>
        )}
      </nav>
    </>
  );
}
