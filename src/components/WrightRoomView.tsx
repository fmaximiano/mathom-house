import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Hammer, Filter, Play, Cpu, Sparkles, Send, Loader2 } from "lucide-react";
import { ProjectItem } from "../types";
import { getProjects } from "../storage";

interface WrightRoomViewProps {
  isFireActive?: boolean;
}

export default function WrightRoomView({ isFireActive = true }: WrightRoomViewProps) {
  const isDark = !isFireActive;
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>("");

  // Simulated Steampunk dashboard sliders
  const [lanternGlow, setLanternGlow] = useState<number>(65);
  const [gearRpm, setGearRpm] = useState<number>(45);
  const [valvePressure, setValvePressure] = useState<number>(80);

  useEffect(() => { setProjects(getProjects()); }, []);

  const categories = ["All", "Automation", "Web App", "AI Experiment", "Craft"];

  const filteredProjects = selectedCategory === "All"
    ? projects
    : projects.filter(p => p.category === selectedCategory);

  const starterPrompts = [
    "Design a copper-cogwheel automated lantern",
    "How would we power a smart bookshelf?",
    "Build a solar moisture sensor for ancient oak roots",
  ];

  const handleConsultAi = async (promptText: string) => {
    if (!promptText.trim()) return;
    setAiPrompt(promptText);
    setLoadingAi(true);
    setAiResponse("");
    setAiError("");

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          room: "wright",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAiResponse(data.text);
      } else {
        setAiError(data.error || "Something rustled in the gears. No response received.");
      }
    } catch (err: any) {
      setAiError("Could not reach the assistant. Perhaps the copper cables are detached.");
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-stretch h-full w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* LEFT: Project Explorer and Simulated Controls */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Project Browser Header */}
        <div className={`backdrop-blur-xl p-6 rounded-2xl transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10" 
            : "bg-white/75 border border-stone-200/90 shadow-md text-stone-800"
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
                <Hammer className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>The Forge & Workbench</span>
              </div>
              <h2 className={`text-2xl font-serif transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>Active Projects & Gadgets</h2>
            </div>
 
            {/* Filter Pill List */}
            <div className={`flex flex-wrap gap-1.5 p-1 rounded-xl self-start md:self-auto transition-colors ${
              isDark 
                ? "bg-[#2C251D]/60 border border-neutral-800/40" 
                : "bg-stone-50 border border-stone-200"
            }`}>
              {categories.map((cat) => (
                <button
                  id={`filter_${cat.toLowerCase().replace(/ /g, "_")}`}
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat
                      ? "bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20"
                      : isDark
                      ? "text-neutral-450 hover:text-[#E5E1D8] border border-transparent"
                      : "text-stone-500 hover:text-stone-800 border border-transparent"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
 
          {/* Project Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {filteredProjects.map((p) => (
              <motion.div
                id={`project_card_${p.id}`}
                key={p.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4, scale: 1.012, borderColor: "rgba(197, 160, 89, 0.22)" }}
                transition={{ 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 24
                }}
                className={`p-5 rounded-xl flex flex-col justify-between shadow-lg cursor-default transition-all duration-300 ${
                  isDark 
                    ? "bg-[#12100E]/40 border border-white/5 hover:border-white/10" 
                    : "bg-stone-50/50 border border-stone-200/65 hover:border-stone-300 hover:bg-stone-50 text-stone-800"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center gap-2 mb-3">
                    <span className="text-[9px] font-mono tracking-wider text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-full uppercase">
                      {p.category}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">ID: {p.id}</span>
                  </div>
                  <h3 className={`text-base font-serif mb-2 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>{p.title}</h3>
                  <p className={`text-xs font-light leading-relaxed mb-4 transition-colors ${isDark ? "text-neutral-400" : "text-stone-550"}`}>
                    {p.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.tags.map((tag) => (
                    <span key={tag} className={`text-[9px] px-2 py-0.5 rounded-md font-mono border transition-colors ${
                      isDark 
                        ? "bg-[#2C251D]/60 border-white/5 text-neutral-300" 
                        : "bg-stone-100 border-stone-200 text-stone-600"
                    }`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
 
        {/* Tactile Workshop Dashboard Controls */}
        <motion.div 
          whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className={`backdrop-blur-xl p-6 rounded-2xl relative overflow-hidden shadow-lg transition-all duration-500 ${
            isDark 
              ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
              : "bg-white/75 border border-stone-200/90 shadow-md text-stone-800"
          }`}
        >
          {/* Reactive amber background glow representing custom lantern glow intensity */}
          <div
            className="absolute inset-0 pointer-events-none transition-all duration-300"
            style={{
              background: `radial-gradient(circle at 80% 80%, rgba(197, 160, 89, ${lanternGlow * 0.0015}), transparent 60%)`
            }}
          />
 
          <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#C5A059]/80 uppercase mb-4">
            // STEAMPUNK ALTITUDE REGULATORS
          </h3>
 
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Slider 1 */}
            <div className="flex flex-col gap-2">
              <div className={`flex justify-between text-xs font-mono transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
                <span>Glow-Lamp Ambiance</span>
                <span className="text-[#C5A059]">{lanternGlow}%</span>
              </div>
              <input
                id="control_lantern_glow"
                type="range"
                min="10"
                max="100"
                value={lanternGlow}
                onChange={(e) => setLanternGlow(Number(e.target.value))}
                className="w-full h-1.5 rounded-full cursor-pointer"
              />
              <p className={`text-[10px] font-light transition-colors ${isDark ? "text-neutral-550" : "text-stone-400"}`}>Tunes the physical golden lighting intensity in this panel.</p>
            </div>
 
            {/* Slider 2 */}
            <div className="flex flex-col gap-2">
              <div className={`flex justify-between text-xs font-mono transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
                <span>Governor Gear Sync</span>
                <span className="text-[#C5A059]">{gearRpm} RPM</span>
              </div>
              <input
                id="control_gear_rpm"
                type="range"
                min="0"
                max="120"
                value={gearRpm}
                onChange={(e) => setGearRpm(Number(e.target.value))}
                className="w-full h-1.5 rounded-full cursor-pointer"
              />
              <div className={`flex items-center gap-1.5 text-[10px] font-light transition-colors ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
                <div
                  className="w-2.5 h-2.5 border border-dashed border-[#C5A059]/60 rounded-full animate-spin"
                  style={{ animationDuration: gearRpm > 0 ? `${120 / gearRpm}s` : "0s" }}
                />
                <span>Sync gear speed calibration controller.</span>
              </div>
            </div>
 
            {/* Slider 3 */}
            <div className="flex flex-col gap-2">
              <div className={`flex justify-between text-xs font-mono transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
                <span>Steam-Pipe Valve</span>
                <span className={`transition-colors ${valvePressure > 90 ? "text-red-400" : "text-[#C5A059]"}`}>{valvePressure} PSI</span>
              </div>
              <input
                id="control_valve_pressure"
                type="range"
                min="20"
                max="110"
                value={valvePressure}
                onChange={(e) => setValvePressure(Number(e.target.value))}
                className="w-full h-1.5 rounded-full cursor-pointer"
              />
              <div className={`w-full h-2 rounded overflow-hidden flex items-center ${isDark ? "bg-neutral-950" : "bg-stone-100 border border-stone-200"}`}>
                <div
                  className={`h-full rounded transition-all duration-300 ${valvePressure > 90 ? "bg-red-500 animate-pulse" : "bg-[#C5A059]"}`}
                  style={{ width: `${valvePressure}%` }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
 
      {/* RIGHT: AI Workbench Assistant Widget */}
      <motion.div 
        whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className={`w-full xl:w-[450px] flex flex-col justify-between backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className={`p-6 border-b transition-all duration-500 ${isDark ? "border-white/5 bg-[#12100E]/40" : "border-stone-100 bg-stone-50/40"}`}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
            <Cpu className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Workbench Assist</span>
          </div>
          <h2 className={`text-lg font-serif flex items-center gap-2 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-800"}`}>
            Ask the Creative Automaton <Sparkles className="w-4 h-4 text-[#C5A059] animate-spin-slow" />
          </h2>
          <p className={`text-xs font-light leading-relaxed mt-2 transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Stuck on a design? Describe a mechanical idea or physical craft, and let the workbench assistant formulate suggestions in hobbit-style steampunk prose.
          </p>
        </div>
 
        {/* AI Output Area */}
        <div className={`flex-1 p-6 flex flex-col justify-between min-h-[300px] transition-all duration-500 ${isDark ? "bg-neutral-950/20" : "bg-stone-50/30"}`}>
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[320px] pr-2 scrollbar-thin">
            {!aiPrompt && !aiResponse && !loadingAi && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-xl">
                <Cpu className="w-8 h-8 text-neutral-600 mb-2" />
                <span className="text-xs text-[#C5A059] font-mono">// ASSISTANT_READY : FURNACE_ON</span>
                <p className="text-[11px] text-neutral-500 font-light mt-2 max-w-[280px]">
                  Pick an idea below or type yours into the copper duct to consult the mechanical spirit of the room.
                </p>
              </div>
            )}
 
            {aiPrompt && (
              <div className={`self-end max-w-[90%] p-3 rounded-2xl rounded-tr-none text-xs border transition-all ${
                isDark 
                  ? "bg-stone-800 text-neutral-200 border-white/5" 
                  : "bg-stone-250 text-stone-800 border-stone-200 bg-stone-200/50"
              }`}>
                <p className="font-mono text-[8.5px] text-[#C5A059] uppercase tracking-wider mb-1 font-bold">Your Query:</p>
                {aiPrompt}
              </div>
            )}
 
            {loadingAi && (
              <div className={`self-start max-w-[90%] border p-3.5 rounded-2xl rounded-tl-none text-xs flex items-center gap-2.5 transition-colors ${
                isDark 
                  ? "bg-[#2C251D]/60 border-white/5 text-neutral-400" 
                  : "bg-stone-100 border border-stone-200 text-stone-500"
              }`}>
                <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
                <span className="font-mono text-[9px] tracking-wider uppercase animate-pulse">Calculating spring dynamics...</span>
              </div>
            )}
 
            {aiResponse && (
              <div className={`self-start max-w-[95%] border p-4 rounded-2xl rounded-tl-none text-xs leading-relaxed font-sans shadow-lg transition-colors ${
                isDark 
                  ? "bg-[#12100E] border-white/10 text-[#E5E1D8]" 
                  : "bg-white border-stone-200/90 text-stone-800"
              }`}>
                <p className="font-mono text-[8px] text-[#C5A059] uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#C5A059] rounded-full animate-ping" />
                  Gears Aligned · Automaton Response
                </p>
                <div className="whitespace-pre-wrap font-light border-l border-[#C5A059]/20 pl-3">
                  {aiResponse}
                </div>
              </div>
            )}
 
            {aiError && (
              <div className="self-start w-full bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-mono">
                {aiError}
              </div>
            )}
          </div>
 
          {/* Starter Quick Actions */}
          {!loadingAi && (
            <div className={`mt-4 pt-4 border-t flex flex-col gap-1.5 ${isDark ? "border-white/5" : "border-stone-100"}`}>
              <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Starter schematics:</span>
              <div className="flex flex-col gap-1">
                {starterPrompts.map((p, idx) => (
                  <button
                    id={`starter_prompt_${idx}`}
                    key={idx}
                    onClick={() => handleConsultAi(p)}
                    className={`cursor-pointer text-left text-[11px] p-2 rounded-lg transition-all flex items-center gap-1.5 font-light border ${
                      isDark 
                        ? "bg-[#12100E]/65 hover:bg-[#2C251D]/60 border-white/5 text-neutral-400 hover:text-[#C5A059]" 
                        : "bg-stone-100 hover:bg-stone-200 border-stone-200/60 text-stone-600 hover:text-stone-850"
                    }`}
                  >
                    <Play className="w-2.5 h-2.5 text-[#C5A059]/40" />
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
 
        {/* Input Footer Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConsultAi(aiPrompt);
          }}
          className={`p-4 border-t flex gap-2 transition-all duration-500 ${
            isDark 
              ? "border-white/5 bg-[#12100E]/90" 
              : "border-stone-200 bg-stone-50"
          }`}
        >
          <input
            id="input_ai_prompt"
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={loadingAi}
            placeholder={isFireActive ? "Type your craft idea into the furnace..." : "Describe your custom craft idea..."}
            className={`flex-1 px-4 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C5A059]/40 font-light transition-all ${
              isDark 
                ? "bg-stone-900 border border-white/5 text-[#E5E1D8]" 
                : "bg-white border border-stone-200 text-stone-800"
            }`}
          />
          <button
            id="btn_submit_ai"
            type="submit"
            disabled={loadingAi || !aiPrompt.trim()}
            className="cursor-pointer bg-[#C5A059] hover:bg-[#b08c48] disabled:opacity-30 text-neutral-950 p-2.5 rounded-xl font-medium transition-all"
          >
            {loadingAi ? <Loader2 className="w-4 h-4 animate-spin animate-spin-slow" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
