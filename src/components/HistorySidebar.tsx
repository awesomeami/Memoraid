import React, { useState, useMemo } from "react";
import { MnemonicResult, MEDICAL_SPECIALTIES } from "../types";
import { Search, Pin, Star, Trash2, Calendar, FileText, CheckCircle2, ChevronRight, CornerDownRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HistorySidebarProps {
  history: MnemonicResult[];
  onSelectMnemonic: (mnemonic: MnemonicResult) => void;
  onDeleteMnemonic: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  isSearchingFullHistory?: boolean;
}

export default function HistorySidebar({
  history,
  onSelectMnemonic,
  onDeleteMnemonic,
  onTogglePin,
  onToggleFavorite,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  search,
  onSearchChange,
  isSearchingFullHistory = false,
}: HistorySidebarProps) {
  const [selectedSpecialty, setSelectedSpecialty] = useState("All");

  // Filter history based on search query and selected specialty
  const { filteredHistory, pinnedItems, unpinnedItems } = useMemo(() => {
    const filtered = history.filter((item) => {
      const matchesSearch =
        item.medicalText.toLowerCase().includes(search.toLowerCase()) ||
        item.bestMnemonic.mnemonic.toLowerCase().includes(search.toLowerCase()) ||
        item.bestMnemonic.expansion.some((exp) =>
          exp.concept.toLowerCase().includes(search.toLowerCase())
        );

      const matchesSpecialty = selectedSpecialty === "All" || item.specialty === selectedSpecialty;

      return matchesSearch && matchesSpecialty;
    });

    const pinned = filtered.filter((item) => item.isPinned);
    const unpinned = filtered.filter((item) => !item.isPinned);

    return { filteredHistory: filtered, pinnedItems: pinned, unpinnedItems: unpinned };
  }, [history, search, selectedSpecialty]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header and Summary stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white">
            Mnemonic History
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Search, pin, and manage your generated medical study guides
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-100/50 dark:border-slate-800/50">
          <span>Total Generated:</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            {history.length}
          </span>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by keyword, mnemonic, or concept..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
        {isSearchingFullHistory && (
          <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1.5 text-xs text-blue-500 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden sm:inline">Searching full history...</span>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/10">
          <FileText className="h-10 w-10 text-slate-400" />
          <h3 className="mt-4 font-display text-base font-bold text-slate-700 dark:text-slate-300">
            No history yet
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-xs text-slate-400 dark:text-slate-500">
            Enter medical notes or a topic on the generator tab to create your first premium medical mnemonic study guide.
          </p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/10">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            No mnemonics match your search filter.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* PINNED SECTION */}
          {pinnedItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <Pin className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />
                Pinned Study Guides
              </h3>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {pinnedItems.map((item) => (
                    <MnemonicMiniCard
                      key={item.id}
                      item={item}
                      formatDate={formatDate}
                      onSelect={() => onSelectMnemonic(item)}
                      onDelete={() => onDeleteMnemonic(item.id)}
                      onTogglePin={() => onTogglePin(item.id)}
                      onToggleFavorite={() => onToggleFavorite(item.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* ALL OTHER ITEMS SECTION */}
          <div className="space-y-3">
            {pinnedItems.length > 0 && (
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                All History
              </h3>
            )}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {unpinnedItems.map((item) => (
                  <MnemonicMiniCard
                    key={item.id}
                    item={item}
                    formatDate={formatDate}
                    onSelect={() => onSelectMnemonic(item)}
                    onDelete={() => onDeleteMnemonic(item.id)}
                    onTogglePin={() => onTogglePin(item.id)}
                    onToggleFavorite={() => onToggleFavorite(item.id)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {hasMore && !search.trim() && (
              <div className="mt-6 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                      <span>Loading more...</span>
                    </>
                  ) : (
                    <span>Load More History</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* MINI COMPONENT FOR HISTORY GRID ITEMS */
interface MnemonicMiniCardProps {
  key?: React.Key;
  item: MnemonicResult;
  formatDate: (t: number) => string;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
}

function MnemonicMiniCard({
  item,
  formatDate,
  onSelect,
  onDelete,
  onTogglePin,
  onToggleFavorite,
}: MnemonicMiniCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={`group relative overflow-hidden rounded-xl border bg-white p-4.5 transition-all hover:border-blue-300/60 hover:shadow-md dark:bg-zinc-900/60 ${
        item.isPinned
          ? "border-blue-100 dark:border-blue-950/20 shadow-sm"
          : "border-slate-100 dark:border-zinc-800"
      }`}
    >
      {/* Category Tag & Time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
            {item.specialty}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {formatDate(item.timestamp)}
          </span>
        </div>

        {/* Small Quick Pin/Fav/Delete Controls */}
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          {showConfirm ? (
            <div className="flex items-center gap-1 rounded bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-950/30 p-0.5 text-[9px]" onClick={(e) => e.stopPropagation()}>
              <span className="text-rose-600 dark:text-rose-400 font-bold px-1">Delete?</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setShowConfirm(false);
                }}
                className="rounded bg-rose-600 text-white px-1.5 py-0.5 font-bold hover:bg-rose-700 cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirm(false);
                }}
                className="rounded bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 px-1.5 py-0.5 font-bold hover:bg-slate-300 dark:hover:bg-zinc-700 cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                className={`p-1.5 rounded hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${
                  item.isPinned ? "text-blue-500" : "text-slate-300 dark:text-slate-600"
                }`}
                title={item.isPinned ? "Unpin study guide" : "Pin study guide"}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                className={`p-1.5 rounded hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${
                  item.isFavorite ? "text-rose-500" : "text-slate-300 dark:text-slate-600"
                }`}
                title={item.isFavorite ? "Remove from favorites" : "Save to favorites"}
              >
                <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirm(true);
                }}
                className="p-1.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-600 dark:hover:text-rose-400 dark:hover:bg-rose-950/20 transition-colors"
                title="Delete from history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main clinical topic */}
      <div className="mt-3">
        <h4 className="font-display text-lg font-black text-slate-900 dark:text-white flex items-baseline gap-2">
          <span className="text-red-600 dark:text-red-400">{item.bestMnemonic.mnemonic}</span>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            ({item.bestMnemonic.memorabilityScore}/10)
          </span>
        </h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {item.medicalText}
        </p>
      </div>

      {/* Expansion Preview */}
      <div className="mt-3 flex flex-wrap gap-1">
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

      {/* Open Button link */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3 dark:border-zinc-800/50">
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
          Strategy: {item.bestMnemonic.strategyUsed}
        </span>
        <button
          onClick={onSelect}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <span>Load Details</span>
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}
