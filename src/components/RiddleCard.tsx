import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Scroll, Eye, EyeOff, Lightbulb, RefreshCw } from "lucide-react";
import { RiddleItem } from "../types";
import { getRiddles, getTodaysRiddle } from "../storage";

interface RiddleCardProps {
  isDark: boolean;
}

export default function RiddleCard({ isDark }: RiddleCardProps) {
  const [riddles, setRiddles] = useState<RiddleItem[]>([]);
  const [todaysRiddle, setTodaysRiddle] = useState<RiddleItem | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const loaded = getRiddles();
    setRiddles(loaded);
    setTodaysRiddle(getTodaysRiddle(loaded));
  }, []);

  useEffect(() => {
    const handleStorage = () => {
      const loaded = getRiddles();
      setRiddles(loaded);
      setTodaysRiddle(getTodaysRiddle(loaded));
      setShowAnswer(false);
      setShowHint(false);
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("riddles-updated", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("riddles-updated", handleStorage);
    };
  }, []);

  const dayOfYear = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  })();

  if (!todaysRiddle) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex-1 backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden shadow-xl transition-all duration-500 ${
          isDark
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100"
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-4">
          <Scroll className="w-3.5 h-3.5 text-[#C5A059]" />
          <span>Daily Riddle</span>
        </div>
        <p className={`text-sm italic font-light ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
          No riddles have been inscribed in the great book yet. Visit the admin chambers to add some.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, borderColor: "rgba(197, 160, 89, 0.22)" }}
      transition={{
        opacity: { duration: 0.6, delay: 0.15 },
        y: { duration: 0.6, delay: 0.15 },
        default: { type: "spring", stiffness: 300, damping: 24 },
      }}
      className={`flex-1 flex flex-col justify-between backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden shadow-xl transition-all duration-500 ${
        isDark
          ? "bg-[#12100E]/70 border border-white/10 text-neutral-100"
          : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
      }`}
    >
      <div className="absolute top-0 left-0 w-48 h-48 bg-radial from-[#C5A059]/10 to-transparent pointer-events-none" />

      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono">
            <Scroll className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Daily Riddle</span>
          </div>
          <span className={`text-[10px] font-mono opacity-40 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
            Day {dayOfYear} &middot; {riddles.length} in the book
          </span>
        </div>

        <h2 className={`text-xl font-medium font-serif mb-4 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>
          A Riddle in the Dark
        </h2>

        <blockquote className={`text-base leading-relaxed font-serif italic border-l-2 border-[#C5A059]/30 pl-4 mb-6 transition-colors ${isDark ? "text-[#E5E1D8]/90" : "text-stone-700"}`}>
          &ldquo;{todaysRiddle.question}&rdquo;
        </blockquote>
        <img src = "./assets/images/riddles_in_the_dark.png"></img>
        {todaysRiddle.hint && (
          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-4"
              >
                <div className={`text-sm font-light flex items-start gap-2 p-3 rounded-xl transition-colors ${
                  isDark ? "bg-amber-900/15 text-amber-200/70" : "bg-amber-50 text-amber-700"
                }`}>
                  <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{todaysRiddle.hint}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {showAnswer && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-4"
            >
              <div className="p-4 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-xl">
                <p className={`text-sm font-mono uppercase tracking-wider ${isDark ? "text-[#C5A059]" : "text-amber-700"}`}>
                  The answer is...
                </p>
                <p className={`text-lg font-serif font-bold mt-1 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>
                  {todaysRiddle.answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex gap-2 mt-4">
        {todaysRiddle.hint && (
          <button
            onClick={() => setShowHint(!showHint)}
            className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              showHint
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : isDark
                ? "border border-neutral-800 hover:border-white/10 hover:bg-white/5 text-neutral-400"
                : "border border-stone-200/80 hover:border-stone-300 hover:bg-stone-50/50 text-stone-500"
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            {showHint ? "Hide Hint" : "Show Hint"}
          </button>
        )}

        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className={`cursor-pointer flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            showAnswer
              ? "bg-[#C5A059] text-neutral-950 font-bold"
              : isDark
              ? "border border-neutral-800 hover:border-[#C5A059]/30 hover:bg-[#C5A059]/10 text-neutral-300"
              : "border border-stone-200/80 hover:border-[#C5A059]/40 hover:bg-[#C5A059]/10 text-stone-600"
          }`}
        >
          {showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showAnswer ? "Hide Answer" : "Reveal Answer"}
        </button>
      </div>
    </motion.div>
  );
}
