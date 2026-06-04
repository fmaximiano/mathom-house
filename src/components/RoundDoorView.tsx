import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import WeatherWidget from "./WeatherWidget";
import RiddleCard from "./RiddleCard";

interface RoundDoorViewProps {
  isFireActive: boolean;
  setIsFireActive: (active: boolean) => void;
}

export default function RoundDoorView({ isFireActive, setIsFireActive }: RoundDoorViewProps) {
  const isDark = !isFireActive;

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
            <span>The Round Door &bull; Entrance</span>
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

      {/* Weather + Riddle Column */}
      <div className="w-full lg:w-[400px] flex flex-col gap-4">
        <WeatherWidget isDark={isDark} />
        <RiddleCard isDark={isDark} />
      </div>
    </div>
  );
}
