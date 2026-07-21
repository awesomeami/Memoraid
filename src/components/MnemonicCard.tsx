import React, { useState, useRef, useEffect } from "react";
import { MnemonicDetails, MnemonicExpansionItem } from "../types";
import { 
  Copy, Download, Star, Pin, Award, Sparkles, Brain, Lightbulb, Check,
  Edit2, Save, X, Undo2, Redo2, FileText, FileDown, Image, Plus, Trash2, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

function cleanAndEscapeAnkiField(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(/[\r\n\t]+/g, " ");
  return cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MnemonicCardProps {
  key?: React.Key;
  data: MnemonicDetails;
  title: string;
  isBest?: boolean;
  isFavorite?: boolean;
  isPinned?: boolean;
  onToggleFavorite?: () => void;
  onTogglePin?: () => void;
  onSelectAsBest?: () => void;
  onSave?: (updatedData: MnemonicDetails) => void;
  medicalText?: string;
}

function MnemonicCard({
  data,
  title,
  isBest = false,
  isFavorite = false,
  isPinned = false,
  onToggleFavorite,
  onTogglePin,
  onSelectAsBest,
  onSave,
  medicalText = "",
}: MnemonicCardProps) {
  const [copied, setCopied] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  
  // Edit Mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editState, setEditState] = useState<MnemonicDetails | null>(null);
  
  // History for Undo/Redo
  const [past, setPast] = useState<MnemonicDetails[]>([]);
  const [future, setFuture] = useState<MnemonicDetails[]>([]);

  const cardRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const lastStateRef = useRef<MnemonicDetails | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const startEditing = () => {
    const initial = JSON.parse(JSON.stringify(data)); // Deep copy
    if (initial.expansion) {
      initial.expansion = initial.expansion.map((item: any, i: number) => ({
        ...item,
        rowId: item.rowId || `row_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}`
      }));
    }
    setEditState(initial);
    lastStateRef.current = initial;
    setPast([]);
    setFuture([]);
    setIsEditing(true);
  };

  const handleStateChange = (updated: MnemonicDetails) => {
    setEditState(updated);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (lastStateRef.current) {
        const hasChanged = JSON.stringify(lastStateRef.current) !== JSON.stringify(updated);
        if (hasChanged) {
          setPast(prev => [...prev, JSON.parse(JSON.stringify(lastStateRef.current))]);
          setFuture([]); // Clear redo stack on new action
          lastStateRef.current = JSON.parse(JSON.stringify(updated));
        }
      }
    }, 400); // 400ms typing debounce
  };

  const handleUndo = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      // Pending uncommitted typed state becomes the future state
      if (editState) {
        setFuture(prev => [JSON.parse(JSON.stringify(editState)), ...prev]);
      }
      if (lastStateRef.current) {
        setEditState(lastStateRef.current);
      }
      return;
    }

    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const remainingPast = past.slice(0, -1);

    if (editState) {
      setFuture(prev => [JSON.parse(JSON.stringify(editState)), ...prev]);
    }
    setEditState(previous);
    setPast(remainingPast);
    lastStateRef.current = previous;
  };

  const handleRedo = () => {
    if (future.length === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const next = future[0];
    const remainingFuture = future.slice(1);

    if (editState) {
      setPast(prev => [...prev, JSON.parse(JSON.stringify(editState))]);
    }
    setEditState(next);
    setFuture(remainingFuture);
    lastStateRef.current = next;
  };

  const handleSave = () => {
    if (!editState) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSave?.(editState);
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setIsEditing(false);
  };

  // Field change dispatchers
  const updateMnemonicWord = (word: string) => {
    if (!editState) return;
    handleStateChange({ ...editState, mnemonic: word });
  };

  const updateExpansionItem = (index: number, field: keyof MnemonicExpansionItem, value: string) => {
    if (!editState) return;
    const newExpansion = [...editState.expansion];
    newExpansion[index] = { ...newExpansion[index], [field]: value };
    handleStateChange({ ...editState, expansion: newExpansion });
  };

  const addExpansionRow = () => {
    if (!editState) return;
    const newRowId = `row_${Date.now()}_${editState.expansion.length}_${Math.random().toString(36).substring(2, 9)}`;
    const newExpansion = [...editState.expansion, { letter: "", concept: "", details: "", rowId: newRowId }];
    handleStateChange({ ...editState, expansion: newExpansion });
  };

  const deleteExpansionRow = (index: number) => {
    if (!editState) return;
    const newExpansion = editState.expansion.filter((_, i) => i !== index);
    handleStateChange({ ...editState, expansion: newExpansion });
  };

  const updateWhyItWorks = (text: string) => {
    if (!editState) return;
    handleStateChange({ ...editState, whyItWorks: text });
  };

  // Export handlers
  const handleCopy = async () => {
    try {
      const expansionText = data.expansion
        .map((item) => `${item.letter} → ${item.concept} (${item.details || ""})`)
        .join("\n");
      const fullText = `
[${title}] ${data.mnemonic}
Memorability Score: ${data.memorabilityScore}/10

Expansion:
${expansionText}
${data.whyItWorks ? `\nWhy It Works:\n${data.whyItWorks}` : ""}
      `.trim();

      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleExportMarkdown = (details: MnemonicDetails) => {
    const expansionText = details.expansion
      .map((item) => `- **${item.letter}**: ${item.concept} — ${item.details || ""}`)
      .join("\n");

    const markdownContent = `
# Medical Mnemonic: ${details.mnemonic}
**Type:** ${title}
**Memorability Score:** ${details.memorabilityScore}/10

## Expansion
${expansionText}
${details.whyItWorks ? `\n## Why This Works\n${details.whyItWorks}` : ""}

---
*Generated by Memoraid — The Intelligent Medical Learning Companion*
    `.trim();

    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Mnemonic_${details.mnemonic.replace(/[^a-zA-Z0-9-_]+/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAnki = (details: MnemonicDetails) => {
    const escapedMedicalText = cleanAndEscapeAnkiField(medicalText);
    const escapedMnemonic = cleanAndEscapeAnkiField(details.mnemonic);

    const expansionHtml = details.expansion
      .map((item) => {
        const letter = cleanAndEscapeAnkiField(item.letter);
        const concept = cleanAndEscapeAnkiField(item.concept);
        const detailsText = item.details ? cleanAndEscapeAnkiField(item.details) : "";
        return `<li><span style="color:#3b82f6; font-weight:bold; font-size:1.1em;">${letter}</span>: <b>${concept}</b>${detailsText ? ` &ndash; <i>${detailsText}</i>` : ""}</li>`;
      })
      .join("");

    const frontHtml = `
<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; border-radius: 10px; background-color: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; max-width: 500px; margin: 0 auto;">
  <div style="font-size: 0.85em; font-weight: bold; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Clinical Study Card</div>
  <div style="font-size: 1.1em; font-weight: 500; line-height: 1.5; color: #334155;">"${escapedMedicalText || "Medical Concept"}"</div>
  <div style="font-size: 0.8em; color: #64748b; margin-top: 15px;">What is the mnemonic strategy?</div>
</div>
    `.trim().replace(/\n/g, " ").replace(/\t/g, " ");

    const backHtml = `
<div style="font-family: Arial, sans-serif; padding: 20px; border-radius: 10px; background-color: #ffffff; color: #1e293b; border: 1px solid #3b82f6; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
  <div style="text-align: center; margin-bottom: 20px;">
    <div style="font-size: 2.5em; font-weight: 900; tracking-wide; color: #1e293b; margin: 0;">
      ${escapedMnemonic}
    </div>
    <div style="font-size: 0.85em; font-weight: bold; color: #64748b; margin-top: 5px;">
      Score: ${details.memorabilityScore}/10
    </div>
  </div>
  
  <div style="border-top: 1px solid #f1f5f9; padding-top: 15px;">
    <div style="font-size: 0.85em; font-weight: bold; color: #3b82f6; text-transform: uppercase; margin-bottom: 10px; text-align: left;">Expansion</div>
    <ul style="list-style-type: none; padding-left: 0; margin: 0; text-align: left;">
      ${expansionHtml}
    </ul>
  </div>
</div>
    `.trim().replace(/\n/g, " ").replace(/\t/g, " ");

    const tags = `Memoraid ${title.replace(/\s+/g, "_")}`;
    const fileContent = `#separator:tab\n#html:true\n#tags:${tags}\n${frontHtml}\t${backHtml}`;
    
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Anki_${details.mnemonic.replace(/[^a-zA-Z0-9-_]+/g, "_")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async (details: MnemonicDetails) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    
    // Title & Brand Accent
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235); // Blue (#2563eb)
    doc.text("Memoraid Study Guide", 20, 25);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Premium Clinical Intelligence Learning Aid", 20, 30);
    doc.line(20, 33, 190, 33);
    
    // Mnemonic display
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(30, 41, 59);
    doc.text(details.mnemonic, 20, 48);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Memorability Score: ${details.memorabilityScore}/10`, 20, 54);

    if (medicalText) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("Clinical Concept Reference:", 20, 63);
      
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const textLines = doc.splitTextToSize(`"${medicalText}"`, 150);
      doc.text(textLines, 20, 68);
    }
    
    // Expansion Section
    let y = medicalText ? 80 + (doc.splitTextToSize(`"${medicalText}"`, 150).length * 5) : 65;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(37, 99, 235);
    doc.text("Mnemonic Expansion", 20, y);
    doc.line(20, y + 2, 190, y + 2);
    
    y += 10;
    doc.setFontSize(10);
    details.expansion.forEach((item) => {
      const conceptLines = doc.splitTextToSize(item.concept || "Pending", 150);
      const conceptHeight = (conceptLines.length - 1) * 4.5;
      
      let itemHeight = conceptHeight + 8;
      let detailsLines: string[] = [];
      if (item.details) {
        detailsLines = doc.splitTextToSize(item.details, 150);
        itemHeight = conceptHeight + 7 + (detailsLines.length * 4.5);
      }
      
      // Page break check before drawing the item
      if (y + itemHeight > 275) {
        doc.addPage();
        y = 20;
      }
      
      // Draw Blue Letter
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(item.letter || "?", 22, y);
      
      doc.setTextColor(30, 41, 59);
      doc.text(conceptLines, 30, y);
      
      if (item.details) {
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(detailsLines, 30, y + conceptHeight + 4.5);
      }
      
      y += itemHeight;
    });

    // Why This Works section in PDF
    if (details.whyItWorks) {
      y += 10;
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text("Why This Works", 20, y);
      doc.line(20, y + 2, 190, y + 2);
      
      y += 10;
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const explanationLines = doc.splitTextToSize(details.whyItWorks, 160);
      explanationLines.forEach((line: string) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, 20, y);
        y += 4.5;
      });
    }
    
    // Save PDF
    doc.save(`Mnemonic_${details.mnemonic.replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`);
  };

  const handleExportImage = async () => {
    if (!cardRef.current) return;
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: document.documentElement.classList.contains("dark") ? "#0a0a0a" : "#ffffff",
        style: {
          padding: "24px",
          borderRadius: "16px",
        },
        filter: (node: any) => {
          // Hide controls, edit areas, or dropdowns during capture
          if (node.classList && (
            node.classList.contains("action-controls") || 
            node.classList.contains("export-menu-dropdown") || 
            node.classList.contains("edit-mode-actions") || 
            node.classList.contains("promote-choice-btn")
          )) {
            return false;
          }
          return true;
        }
      });
      
      const link = document.createElement("a");
      link.download = `Mnemonic_${data.mnemonic.replace(/[^a-zA-Z0-9-_]+/g, "_")}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error exporting card as image:", error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return "from-blue-500 to-rose-500 text-blue-700 dark:text-blue-400";
    if (score >= 7) return "from-rose-500 to-slate-500 text-rose-700 dark:text-rose-400";
    if (score >= 5) return "from-slate-500 to-black text-slate-700 dark:text-slate-400";
    return "from-slate-300 to-slate-400 text-slate-500 dark:text-slate-400";
  };

  const scoreColorClass = getScoreColor(data.memorabilityScore);
  const gradientClasses = scoreColorClass.split(" ").filter(c => c.startsWith("from-") || c.startsWith("to-")).join(" ");
  const textClasses = scoreColorClass.split(" ").filter(c => c.startsWith("text-") || c.startsWith("dark:text-")).join(" ");

  // RENDERING COMPONENT
  return (
    <motion.div
      ref={cardRef}
      initial={isBest ? { opacity: 0, scale: 0.95, y: 15 } : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={isBest ? { type: "spring", stiffness: 100, damping: 15 } : { duration: 0.15 }}
      className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 dark:bg-zinc-900 ${
        isEditing
          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-lg dark:border-blue-500"
          : isBest
          ? "border-blue-200 shadow-md ring-1 ring-blue-100 dark:border-blue-950 dark:ring-blue-950/20"
          : "border-slate-100 dark:border-zinc-800"
      }`}
    >
      {/* Top Visual Gradient Accent Bar */}
      {(isBest || isEditing) && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-rose-500 to-black" />
      )}

      {isEditing && editState ? (
        /* EDITING MODE INTERFACE */
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Customizing Study Guide
              </span>
            </div>

            {/* Undo, Redo, Cancel, Save row */}
            <div className="flex items-center gap-1 edit-mode-actions">
              <button
                type="button"
                onClick={handleUndo}
                disabled={past.length === 0 && !debounceTimerRef.current}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Undo edit"
                aria-label="Undo edit"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              
              <button
                type="button"
                onClick={handleRedo}
                disabled={future.length === 0}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Redo edit"
                aria-label="Redo edit"
              >
                <Redo2 className="h-4 w-4" />
              </button>

              <span className="text-slate-200 dark:text-zinc-800">|</span>

              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Mnemonic Word block */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Mnemonic Key Word
            </label>
            <input
              type="text"
              value={editState.mnemonic}
              onChange={(e) => updateMnemonicWord(e.target.value)}
              placeholder="e.g. SHOCK"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-lg font-extrabold tracking-widest text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-100 dark:placeholder-zinc-800"
            />
          </div>

          {/* Expansion items container */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Expansion Letters & Meanings
            </label>
            <div className="space-y-3">
              {editState.expansion.map((item, index) => (
                <div 
                  key={item.rowId || index}
                  className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/30 p-3.5 dark:border-zinc-800/40 dark:bg-zinc-950/30"
                >
                  <input
                    type="text"
                    value={item.letter}
                    onChange={(e) => updateExpansionItem(index, "letter", e.target.value.toUpperCase())}
                    placeholder="S"
                    className="w-10 h-10 text-center font-display text-base font-black rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 text-blue-600 dark:text-blue-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    maxLength={2}
                  />

                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={item.concept}
                      onChange={(e) => updateExpansionItem(index, "concept", e.target.value)}
                      placeholder="Medical Concept (e.g. Sepsis)"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    />
                    <input
                      type="text"
                      value={item.details || ""}
                      onChange={(e) => updateExpansionItem(index, "details", e.target.value)}
                      placeholder="Additional Clinical Details (optional)"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteExpansionRow(index)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors self-center"
                    title="Delete row"
                    aria-label="Delete row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addExpansionRow}
              className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-dashed border-slate-200 hover:border-blue-500/40 bg-slate-50/20 hover:bg-blue-50/10 py-3 text-xs font-bold text-slate-500 hover:text-blue-600 dark:border-zinc-800 dark:bg-zinc-950/20 dark:hover:bg-blue-950/5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Letter Row</span>
            </button>
          </div>



          {/* Save & Cancel footer row */}
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700 transition-all shadow-sm"
            >
              Save Custom Mnemonic
            </button>
          </div>
        </div>
      ) : (
        /* STANDARD VIEW INTERFACE */
        <>
          {/* Card Header */}
          <div className="flex flex-row items-center justify-end mb-2">
            {/* Action Controls */}
            <div className="flex items-center gap-1 action-controls">
              {/* EDIT BUTTON */}
              {onSave && (
                <button
                  onClick={startEditing}
                  title="Customize study guide"
                  aria-label="Customize study guide"
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}

              {onTogglePin && (
                <button
                  onClick={onTogglePin}
                  title={isPinned ? "Unpin mnemonic" : "Pin mnemonic to top"}
                  aria-label={isPinned ? "Unpin mnemonic" : "Pin mnemonic to top"}
                  className={`p-2 rounded-lg transition-colors ${
                    isPinned
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                  }`}
                >
                  <Pin className={`h-4 w-4 ${isPinned ? "fill-amber-500" : ""}`} />
                </button>
              )}

              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                  aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                  className={`p-2 rounded-lg transition-colors ${
                    isFavorite
                      ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                  }`}
                >
                  <Star className={`h-4 w-4 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
                </button>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCopy}
                title="Copy contents"
                aria-label="Copy contents"
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </motion.button>

              {/* EXPORT DROP DOWN */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  title="Export options (PDF, PNG, Anki, Markdown)"
                  aria-label="Export options (PDF, PNG, Anki, Markdown)"
                  className={`p-2 rounded-lg transition-colors ${
                    exportMenuOpen 
                      ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-zinc-200" 
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                  }`}
                >
                  <Download className="h-4 w-4" />
                </button>

                {exportMenuOpen && (
                  <div className="export-menu-dropdown absolute right-0 top-10 z-50 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 transition-all">
                    <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-zinc-900 mb-1">
                      Export Study Guide
                    </div>
                    
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        handleExportPDF(data);
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-blue-500" />
                      <span>Export as PDF Document</span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        handleExportImage();
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <Image className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Export as JPEG Card Image</span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        handleExportAnki(data);
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <Brain className="h-3.5 w-3.5 text-blue-500" />
                      <span>Export for Anki (TSV)</span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        handleExportMarkdown(data);
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5 text-slate-500" />
                      <span>Export as Markdown</span>
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mnemonic Display & Flashcard Headline */}
          {isBest ? (
            /* Centered flashcard headline for Winner Option */
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100/40 dark:border-blue-950/30 p-8 text-center shadow-inner">
              <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-widest text-slate-900 dark:text-white drop-shadow-sm select-all">
                {data.mnemonic.split("").map((letter, idx) => (
                  <span
                    key={idx}
                    className={
                      idx % 2 === 0
                        ? "text-slate-900 dark:text-white"
                        : "text-blue-600 dark:text-blue-400"
                    }
                  >
                    {letter}
                  </span>
                ))}
              </h2>
            </div>
          ) : (
            /* Left-aligned smaller/secondary headline for Alternative Option */
            <div className="mt-4 mb-2 flex flex-col items-start">
              <h2 className="font-display text-2xl font-extrabold tracking-wide text-slate-900 dark:text-white sm:text-3xl">
                {data.mnemonic.split("").map((letter, idx) => (
                  <span
                    key={idx}
                    className={
                      idx % 2 === 0
                        ? "text-slate-900 dark:text-white"
                        : "text-blue-600 dark:text-blue-400"
                    }
                  >
                    {letter}
                  </span>
                ))}
              </h2>
            </div>
          )}

          {/* Score/Recall Strength Gauge (Without text justification) */}
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50/50 p-4 dark:bg-zinc-950/40 border border-slate-100/50 dark:border-zinc-800/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Recall Strength
            </span>
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-1"
            >
              {Array.from({ length: 10 }).map((_, idx) => (
                <motion.span
                  key={idx}
                  variants={itemVariants}
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                    idx < data.memorabilityScore
                      ? `bg-gradient-to-r ${gradientClasses} scale-105 shadow-sm shadow-blue-500/20`
                      : "bg-slate-200 dark:bg-zinc-800"
                  }`}
                />
              ))}
              <span className={`ml-2 text-xs font-bold ${textClasses}`}>
                {data.memorabilityScore}/10
              </span>
            </motion.div>
          </div>

          {/* Collapsible expansion and cognitive details section */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100/70 p-3 text-xs font-bold text-slate-700 dark:bg-zinc-950 dark:text-slate-300 border border-slate-100/50 dark:border-zinc-800/60 transition-all shadow-sm focus:outline-none cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                {isDetailsExpanded ? "Hide Letter Breakdown" : "Show Letter Breakdown"}
              </span>
              <motion.span
                animate={{ rotate: isDetailsExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-slate-400"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isDetailsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="space-y-4 pt-4"
                >
                  {/* Letter Expansion list */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Mnemonic Expansion
                    </h3>
                    <motion.div 
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="grid gap-2.5 sm:grid-cols-1"
                    >
                      {data.expansion.map((item, index) => (
                        <motion.div
                          key={index}
                          variants={itemVariants}
                          className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/75 dark:bg-zinc-950 dark:border dark:border-zinc-800/40 dark:hover:bg-zinc-800/40"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 font-mono text-sm font-black text-white dark:bg-blue-500 shadow-sm shadow-blue-500/20">
                            {item.letter}
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.concept}
                            </h4>
                            {item.details && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                {item.details}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>

                  {/* Why It Works (Cognitive Justification) */}
                  {data.whyItWorks && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/60">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        <Lightbulb className="h-3.5 w-3.5" />
                        Why This Works
                      </h3>
                      <div className="rounded-xl bg-slate-50/50 p-3.5 border border-slate-100 dark:bg-zinc-950/40 dark:border-zinc-800/60">
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {data.whyItWorks}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Promote Choice Option */}
          {!isBest && onSelectAsBest && (
            <div className="mt-5 flex justify-end promote-choice-btn">
              <button
                onClick={onSelectAsBest}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Promote to Top Choice ⭐
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default React.memo(MnemonicCard);
