import React from "react";
import { Sparkles, HelpCircle } from "lucide-react";

interface HeroSectionProps {
  onSelectExample?: (text: string) => void;
}

export default function HeroSection({ onSelectExample }: HeroSectionProps) {
  const examples = [
    {
      label: "Cranial nerves",
      text: "The 12 pairs of cranial nerves are olfactory (I), optic (II), oculomotor (III), trochlear (IV), trigeminal (V), abducens (VI), facial (VII), vestibulocochlear (VIII), glossopharyngeal (IX), vagus (X), accessory (XI), and hypoglossal (XII)."
    },
    {
      label: "DKA symptoms",
      text: "Diabetic ketoacidosis presents with clinical hallmarks including delirium/altered mental status, Kussmaul respirations, abdominal pain, and dehydration/dry mouth."
    },
    {
      label: "Beta-blocker side effects",
      text: "Beta-blocker side effects include bradycardia, bronchospasm, cold extremities, sleep disturbances (insomnia or vivid dreams), and masking of hypoglycemia symptoms."
    },
    {
      label: "Anion gap causes",
      text: "High anion gap metabolic acidosis causes include methanol ingestion, uremia, diabetic ketoacidosis, propylene glycol, isoniazid, lactic acidosis, ethylene glycol, and salicylates."
    },
    {
      label: "Cardiac murmurs",
      text: "Systolic murmurs include aortic stenosis and mitral regurgitation during contraction. Diastolic murmurs include aortic regurgitation and mitral stenosis during relaxation."
    }
  ];

  return (
    <div className="py-2 space-y-6">
      {/* Visual Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50/50 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100/20">
          <Sparkles className="h-3.5 w-3.5" />
          The Ultimate Medical Mnemonic Engine
        </div>
        
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Supercharge Your <span className="text-blue-600 dark:text-blue-500">Medical Memory</span>
        </h1>
      </div>

      {/* Example Chips */}
      {onSelectExample && (
        <div className="pt-2 text-center space-y-3 max-w-xl mx-auto">
          <div className="flex items-center justify-center gap-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
            <span>Select a clinical topic to try instantly:</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map((example, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectExample(example.text)}
                className="rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-blue-500/5 active:scale-95"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
