import React, { useState } from "react";
import { MnemonicResult, MEDICAL_SPECIALTIES } from "../types";
import { Search, Star, Heart, ChevronRight, Download, Copy, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface FavoritesGridProps {
  history: MnemonicResult[];
  onSelectMnemonic: (mnemonic: MnemonicResult) => void;
  onToggleFavorite: (id: string) => void;
  onClearAll?: () => void;
}

export default function FavoritesGrid({
  history,
  onSelectMnemonic,
  onToggleFavorite,
  onClearAll,
}: FavoritesGridProps) {
  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const favoriteItems = history.filter((item) => item.isFavorite);

  // Filter based on query
  const filteredFavorites = favoriteItems.filter((item) => {
    const matchesSearch =
      item.medicalText.toLowerCase().includes(search.toLowerCase()) ||
      item.bestMnemonic.mnemonic.toLowerCase().includes(search.toLowerCase()) ||
      item.bestMnemonic.expansion.some((exp) =>
        exp.concept.toLowerCase().includes(search.toLowerCase())
      );

    const matchesSpecialty = selectedSpecialty === "All" || item.specialty === selectedSpecialty;

    return matchesSearch && matchesSpecialty;
  });

  const handleCopy = async (e: React.MouseEvent, item: MnemonicResult) => {
    e.stopPropagation();
    try {
      const expansionText = item.bestMnemonic.expansion
        .map((exp) => `${exp.letter} → ${exp.concept} (${exp.details || ""})`)
        .join("\n");
      const fullText = `
[${item.specialty}] ${item.bestMnemonic.mnemonic}
Strategy: ${item.bestMnemonic.strategyUsed}
Memorability Score: ${item.bestMnemonic.memorabilityScore}/10

Expansion:
${expansionText}
      `.trim();

      await navigator.clipboard.writeText(fullText);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const handleDownload = (e: React.MouseEvent, item: MnemonicResult) => {
    e.stopPropagation();
    const expansionText = item.bestMnemonic.expansion
      .map((exp) => `- **${exp.letter}**: ${exp.concept} — ${exp.details || ""}`)
      .join("\n");

    const markdownContent = `
# Saved Medical Mnemonic: ${item.bestMnemonic.mnemonic}
**Specialty:** ${item.specialty}
**Strategy:** ${item.bestMnemonic.strategyUsed}

## Expansion
${expansionText}
    `.trim();

    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Saved_Mnemonic_${item.bestMnemonic.mnemonic.replace(/[^a-zA-Z0-9-_]+/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header and Summary stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white">
            Saved Favorites
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            A repository of your hand-picked highly memorable mnemonics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {favoriteItems.length > 0 && onClearAll && (
            <div className="relative">
              {showClearConfirm ? (
                <div className="flex items-center gap-1 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-950/30 p-2 text-xs">
                  <span className="text-rose-600 dark:text-rose-400 font-bold px-1">Clear All?</span>
                  <button
                    onClick={() => {
                      onClearAll();
                      setShowClearConfirm(false);
                    }}
                    className="rounded bg-rose-600 text-white px-2 py-1 font-bold hover:bg-rose-700 cursor-pointer transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="rounded bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 px-2 py-1 font-bold hover:bg-slate-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors shadow-sm cursor-pointer"
                  title="Clear all favorites"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-100/50 dark:border-slate-800/50">
            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
            <span>Saved:</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
              {favoriteItems.length}
            </span>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search favorites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {favoriteItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/10">
          <Star className="h-10 w-10 text-rose-300 animate-pulse" />
          <h3 className="mt-4 font-display text-base font-bold text-slate-700 dark:text-slate-300">
            Nothing starred yet
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-xs text-slate-400 dark:text-slate-500">
            Save a mnemonic here to build your revision deck and keep your top recall triggers at your fingertips.
          </p>
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/10">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            No favorited mnemonics match your filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredFavorites.map((item) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-100 bg-white p-5 shadow-sm hover:border-blue-300/60 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                {/* Accent Ribbon */}
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-rose-500" />

                <div>
                  {/* Category and Unfavorite */}
                  <div className="flex items-center justify-between gap-2 pl-1">
                    <span className="rounded bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                      {item.specialty}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Copy */}
                      <button
                        onClick={(e) => handleCopy(e, item)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Download */}
                      <button
                        onClick={(e) => handleDownload(e, item)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                        title="Download Markdown"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>

                      {/* Toggle favorite */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(item.id);
                        }}
                        className="p-1.5 rounded text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors"
                        title="Remove from favorites"
                      >
                        <Star className="h-3.5 w-3.5 fill-rose-500" />
                      </button>
                    </div>
                  </div>

                  {/* Main Mnemonic */}
                  <div className="mt-3 pl-1">
                    <h3 className="font-display text-lg font-black text-slate-900 dark:text-white flex items-baseline gap-2">
                      <span className="text-rose-600 dark:text-rose-400">
                        {item.bestMnemonic.mnemonic}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                        ({item.bestMnemonic.memorabilityScore}/10)
                      </span>
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.medicalText}
                    </p>
                  </div>

                  {/* Expansion Preview */}
                  <div className="mt-3 flex flex-wrap gap-1 pl-1">
                    {item.bestMnemonic.expansion.slice(0, 4).map((exp, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-zinc-800/50 dark:text-slate-400"
                      >
                        <span className="font-bold text-blue-600 dark:text-blue-400">{exp.letter}</span>
                        <span className="truncate max-w-[50px]">{exp.concept}</span>
                      </span>
                    ))}
                    {item.bestMnemonic.expansion.length > 4 && (
                      <span className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 dark:bg-zinc-800/50">
                        +{item.bestMnemonic.expansion.length - 4} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Foot load details button */}
                <div className="mt-4 border-t border-slate-50 pt-3 flex justify-between items-center pl-1 dark:border-zinc-800/50">
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    Strategy: {item.bestMnemonic.strategyUsed}
                  </span>
                  <button
                    onClick={() => onSelectMnemonic(item)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <span>Load Workspace</span>
                    <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
