import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Coffee, Sparkles, Wind, Hourglass } from "lucide-react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: string | number): any;
  export function jsxs(type: any, props: any, key?: string | number): any;
  export function jsxDEV(type: any, props: any, key?: string | number, isStaticChildren?: boolean, source?: any, self?: any): any;
}

interface RoundDoorViewProps {
  isFireActive: boolean;
  setIsFireActive: (active: boolean) => void;
}

export default function RoundDoorView({ isFireActive, setIsFireActive }: RoundDoorViewProps) {
  const isDark = !isFireActive;
  const [steepingTime, setSteepingTime] = useState<number>(0);
  const [activeTea, setActiveTea] = useState<string>("");
  const [steepMessage, setSteepMessage] = useState<string>("");

  const teas = [
    { name: "Ember-Leaf Brew", duration: 10, quote: "Perfect for stoking creative fires." },
    { name: "Clover-Meadow Mint", duration: 15, quote: "Restores a restless traveler's mind." },
    { name: "Old Toby Chamomile", duration: 20, quote: "For deep, restful dreams." },
  ];

  useEffect(() => {
    if (steepingTime > 0) {
      const timer = setInterval(() => {
        setSteepingTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setSteepMessage("🍵 Your tea is fully infused! The ceramic mug warms your hands.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [steepingTime]);

  const handleStartBrew = (tea: typeof teas[0]) => {
    setActiveTea(tea.name);
    setSteepingTime(tea.duration);
    setSteepMessage(`Brewing ${tea.name}... ${tea.quote}`);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-stretch h-full w-full max-w-6xl mx-auto p-4 md:p-8">
      {/* Welcome & Prose Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -3, borderColor: "rgba(197, 160, 89, 0.22)" }}
        transition={{ 
          opacity: { duration: 0.6 },
          y: { duration: 0.6 },
          default: { type: "spring", stiffness: 300, damping: 24 }
        }}
        className={`flex-1 flex flex-col justify-between backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden shadow-xl transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-[#C5A059]/10 to-transparent pointer-events-none" />
        
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-6">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-[#C5A059]" />
            <span>The Round Door • Entrance</span>
          </div>
          <h1 className={`text-5xl md:text-8xl font-black font-serif leading-[0.85] tracking-tight mb-8 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>
            COZY <br/>
            RECLUSE.
          </h1>
          <p className={`text-base md:text-lg leading-relaxed mb-6 font-light transition-colors ${isDark ? "text-[#E5E1D8]/80" : "text-stone-600"}`}>
            A digital dwelling for creative artifacts, architectural experiments, and curated mathoms. Step through the green threshold into a sanctuary of intentional design.
          </p>
          <p className={`text-sm md:text-base leading-relaxed font-light transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Here, we curate the creative, archive the forgotten, and gaze through grand circular viewports at distant horizons. Let the dust settle, take off your heavy boots, and make yourself at home.
          </p>
        </div>

      </motion.div>

      {/* Interactive Tea & Comfort Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -3, borderColor: "rgba(197, 160, 89, 0.22)" }}
        transition={{ 
          opacity: { duration: 0.6, delay: 0.1 },
          scale: { duration: 0.6, delay: 0.1 },
          default: { type: "spring", stiffness: 300, damping: 24 }
        }}
        className={`w-full lg:w-[400px] flex flex-col justify-between backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden shadow-xl transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className="absolute top-0 left-0 w-48 h-48 bg-radial from-[#C5A059]/10 to-transparent pointer-events-none" />

        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-4">
            <Coffee className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Infusions & Teas</span>
          </div>
          <h2 className={`text-xl font-medium font-serif mb-3 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>Tea-Steeping Hourglass</h2>
          <p className={`text-sm leading-relaxed mb-6 font-light transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Select an herbal tea from our lower gardens to brew. Steeping the leaves triggers a tiny timer to settle your mind.
          </p>

          <div className="flex flex-col gap-3">
            {teas.map((t) => (
              <button
                id={`tea_${t.name.toLowerCase().replace(/ /g, "_")}`}
                key={t.name}
                onClick={() => handleStartBrew(t)}
                disabled={steepingTime > 0}
                className={`cursor-pointer w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                  activeTea === t.name && steepingTime > 0
                    ? "bg-[#C5A059]/10 border-[#C5A059]/30 text-[#C5A059] font-medium"
                    : steepingTime > 0
                    ? isDark ? "opacity-40 border-neutral-800 text-neutral-500 cursor-not-allowed" : "opacity-45 border-stone-200 text-stone-400 cursor-not-allowed"
                    : isDark 
                    ? "border-neutral-800 hover:border-white/10 hover:bg-white/5 text-neutral-300"
                    : "border-stone-200/80 hover:border-stone-300 hover:bg-stone-50/50 text-stone-600"
                }`}
              >
                <div>
                  <h4 className={`text-sm font-medium transition-colors ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{t.name}</h4>
                  <p className={`text-xs font-light mt-0.5 transition-colors ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{t.quote}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#C5A059]">
                  <Hourglass className="w-3.5 h-3.5" />
                  <span>{t.duration}s</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Brewing Status Area */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <AnimatePresence mode="wait">
            {steepingTime > 0 ? (
              <motion.div
                key="brewing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                <div className="flex justify-between items-center text-xs font-mono text-[#C5A059]">
                  <span className="flex items-center gap-1">
                    <Wind className="w-3 h-3 animate-spin text-[#C5A059]" /> Steeping active...
                  </span>
                  <span>{steepingTime}s left</span>
                </div>
                <div className="w-full bg-[#2C251D] h-2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: teas.find(t => t.name === activeTea)?.duration || 10, ease: "linear" }}
                    className="h-full bg-gradient-to-r from-[#C5A059] to-[#E5E1D8] rounded-full"
                  />
                </div>
              </motion.div>
            ) : steepMessage ? (
              <motion.div
                key="alert"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-[#C5A059]/10 border border-[#C5A059]/20 text-[#C5A059] rounded-xl text-xs leading-relaxed"
              >
                {steepMessage}
              </motion.div>
            ) : (
              <div className={`text-center text-xs py-2 italic font-light transition-colors ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
                No brew warming right now. Pick an infusion to start.
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
