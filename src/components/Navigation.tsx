import { motion } from "motion/react";
import { DoorOpen, Hammer, Archive, Globe, Sparkles, Flame, Settings } from "lucide-react";
import { RoomType } from "../types";

interface NavigationProps {
  activeRoom: RoomType;
  setActiveRoom: (room: RoomType) => void;
  isFireActive?: boolean;
  setIsFireActive?: (active: boolean) => void;
  onOpenAdmin?: () => void;
}

export default function Navigation({ activeRoom, setActiveRoom, isFireActive = true, setIsFireActive, onOpenAdmin }: NavigationProps) {
  const isDark = !isFireActive;
  const tabs = [
    { id: "door", label: "The Round Door", icon: DoorOpen },
    { id: "wright", label: "The Wright-room", icon: Hammer },
    { id: "mathoms", label: "Mathoms", icon: Archive },
    { id: "world_rim", label: "The World-rim", icon: Globe },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4 md:p-6 pointer-events-none">
      <div className={`max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pointer-events-auto backdrop-blur-md rounded-2xl md:rounded-3xl p-3 md:px-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)] transition-all duration-500 ${
        isDark 
          ? "bg-[#12100E]/75 border border-white/5" 
          : "bg-white/80 border border-stone-200/90 shadow-[0_12px_40px_rgba(40,30,20,0.08)]"
      }`}>
        
        {/* Brand Label */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059]">
            <Sparkles className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h1 className={`text-base font-bold font-serif tracking-tight transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>Mathom House</h1>
            <p className="text-[9px] text-[#C5A059] font-mono tracking-widest uppercase">Est. 2026</p>
          </div>
        </div>

        {/* Tab Links */}
        <nav className={`flex flex-wrap items-center justify-center gap-1 p-1 rounded-xl shadow-inner transition-colors ${
          isDark 
            ? "bg-[#2C251D]/60 border border-neutral-800/80" 
            : "bg-stone-100 border border-stone-200"
        }`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeRoom === tab.id;

            return (
              <button
                id={`nav_tab_${tab.id}`}
                key={tab.id}
                onClick={() => setActiveRoom(tab.id as RoomType)}
                className={`cursor-pointer relative px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-semibold tracking-wider transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "text-[#C5A059] font-bold"
                    : isDark 
                    ? "text-neutral-450 hover:text-[#E5E1D8]" 
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-lg"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#C5A059]" : isDark ? "text-neutral-500" : "text-stone-400"}`} />
                <span className="relative z-10 font-display">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status indicator / Ambient Sound controls */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-xl transition-all duration-500 ${
              isFireActive 
                ? 'bg-[#C5A059]/20 text-[#C5A059]' 
                : 'bg-stone-200/80 text-stone-500'
            }`}>
              <Flame className={`w-3.5 h-3.5 ${isFireActive ? 'animate-bounce' : ''}`} />
            </div>
            <div className="hidden lg:block text-left">
              <h3 className={`text-[10px] font-bold tracking-wide uppercase transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-700"}`}>
                {isFireActive ? "Hearth is Warm" : "Hearth is Idle"}
              </h3>
            </div>
          </div>

          {setIsFireActive && (
            <button
              id="btn_stoke_fire"
              onClick={() => setIsFireActive(!isFireActive)}
              className={`cursor-pointer px-3 py-1.5 rounded-lg font-medium text-[11px] transition-all flex items-center gap-1.5 shadow-md ${
                isFireActive
                  ? "bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 font-bold"
                  : "bg-stone-800 hover:bg-stone-700 text-[#E5E1D8]"
              }`}
            >
              {isFireActive ? "Chill Fireplace" : "Stoke the Fire"}
            </button>
          )}

          {onOpenAdmin && (
            <button
              id="btn_admin"
              onClick={onOpenAdmin}
              title="Admin Chambers"
              className={`cursor-pointer p-1.5 rounded-lg transition-all ${
                isDark ? "hover:bg-white/5 text-neutral-600 hover:text-neutral-400" : "hover:bg-stone-100 text-stone-400 hover:text-stone-600"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
