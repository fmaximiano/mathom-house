import { useState, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Flame, Plus, Check, Copy, Archive, BookOpen, Send, Loader2 } from "lucide-react";
import { INITIAL_MATHOMS } from "../data";
import { MathomItem } from "../types";

interface MathomsViewProps {
  isFireActive?: boolean;
}

export default function MathomsView({ isFireActive = true }: MathomsViewProps) {
  const isDark = !isFireActive;
  const [mathoms, setMathoms] = useState<MathomItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("All");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchInput, setSearchInput] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string>("");

  // Add custom mathom drawer state
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newCategory, setNewCategory] = useState<"Prompts" | "Lore" | "Articles" | "References">("References");
  const [newContent, setNewContent] = useState<string>("");
  const [newTags, setNewTags] = useState<string>("");

  // Fireplace Archivist API state
  const [spiritPrompt, setSpiritPrompt] = useState<string>("");
  const [spiritResponse, setSpiritResponse] = useState<string>("");
  const [loadingSpirit, setLoadingSpirit] = useState<boolean>(false);
  const [spiritError, setSpiritError] = useState<string>("");

  useEffect(() => {
    // Initial load from local storage or fallback to system database
    const saved = localStorage.getItem("mathom_house_cabinet");
    if (saved) {
      try {
        setMathoms(JSON.parse(saved));
      } catch (e) {
        setMathoms(INITIAL_MATHOMS);
      }
    } else {
      setMathoms(INITIAL_MATHOMS);
    }
  }, []);

  const saveMathoms = (items: MathomItem[]) => {
    setMathoms(items);
    localStorage.setItem("mathom_house_cabinet", JSON.stringify(items));
  };

  const handleAddMathom = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const parsedTags = newTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const newItem: MathomItem = {
      id: `mathom-${Date.now()}`,
      title: newTitle,
      content: newContent,
      category: newCategory,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      tags: parsedTags.length > 0 ? parsedTags : ["Custom", "Archive"],
    };

    const updated = [newItem, ...mathoms];
    saveMathoms(updated);

    // Reset Form
    setNewTitle("");
    setNewContent("");
    setNewTags("");
    setIsAddOpen(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const handleConsultSpirit = async (promptText: string) => {
    if (!promptText.trim()) return;
    setSpiritPrompt(promptText);
    setLoadingSpirit(true);
    setSpiritResponse("");
    setSpiritError("");

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          room: "mathoms",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSpiritResponse(data.text);
      } else {
        setSpiritError(data.error || "The embers popped, but the archivist didn't reply.");
      }
    } catch (err: any) {
      setSpiritError("The chimney flue is jammed. Could not contact the firelight archivist.");
    } finally {
      setLoadingSpirit(false);
    }
  };

  const filteredMathoms = mathoms.filter((m) => {
    const matchesCategory = activeCategory === "All" || m.category === activeCategory;
    const matchesSearch =
      m.title.toLowerCase().includes(searchInput.toLowerCase()) ||
      m.content.toLowerCase().includes(searchInput.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(searchInput.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const categories = ["All", "Prompts", "References", "Lore", "Articles"];

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-stretch h-full w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* LEFT: Hearthside Library Cabinet */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Shelf Dashboard Cover */}
        <motion.div 
          whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className={`backdrop-blur-xl p-6 rounded-2xl shadow-lg transition-all duration-500 ${
            isDark 
              ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
              : "bg-white/75 border border-stone-200/90 shadow-md text-stone-800"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
                <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>The Card Catalog</span>
              </div>
              <h2 className={`text-2xl font-serif transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-850"}`}>Curated Mathoms & Files</h2>
            </div>
 
            {/* Catalog Utilities */}
            <div className="flex items-center gap-2">
              <button
                id="btn_open_add_mathom"
                onClick={() => setIsAddOpen(!isAddOpen)}
                className="cursor-pointer bg-[#C5A059]/10 hover:bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/20 px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Catalog New Mathom</span>
              </button>
            </div>
          </div>
 
          {/* Search Box & Category Filters */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pb-6 border-b border-white/5">
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                id="mathom_search_input"
                type="text"
                placeholder="Search catalog tags, content, archives..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`w-full border rounded-xl py-2 py-2.5 pl-9 pr-4 text-xs focus:outline-none font-light transition-all ${
                  isDark 
                    ? "bg-stone-900 border-white/5 text-white focus:border-[#C5A059]/30" 
                    : "bg-white border-stone-200 text-stone-800 focus:border-[#C5A059]/30"
                }`}
              />
            </div>
 
            <div className={`flex flex-wrap gap-1.5 p-1 rounded-xl self-start md:self-auto transition-colors ${
              isDark 
                ? "bg-[#2C251D]/60 border border-neutral-800/40" 
                : "bg-stone-50 border border-stone-200"
            }`}>
              {categories.map((c) => (
                <button
                  id={`mathom_cat_${c.toLowerCase().replace(/ /g, "_")}`}
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === c
                      ? "bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20"
                      : isDark
                      ? "text-neutral-450 hover:text-white border border-transparent"
                      : "text-stone-450 hover:text-stone-750 border border-transparent"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
 
          {/* Drawer / Add Form (Collapsible) */}
          <AnimatePresence>
            {isAddOpen && (
              <motion.form
                onSubmit={handleAddMathom}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/10"
              >
                <div className="py-6 flex flex-col gap-4">
                  <h3 className="text-sm font-serif text-[#E5E1D8] flex items-center gap-1.5">
                    <Archive className="w-4 h-4 text-[#C5A059]" /> Archiving New Reference
                  </h3>
 
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase">Mathom Name</label>
                      <input
                        id="new_mathom_title"
                        type="text"
                        required
                        placeholder="e.g. Copper wire calibration sheet"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="bg-stone-900 border border-white/5 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]/40 font-light"
                      />
                    </div>
 
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase">Drawer Category</label>
                      <select
                        id="new_mathom_category"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="bg-stone-900 border border-white/5 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]/40 font-light"
                      >
                        <option value="References">References</option>
                        <option value="Prompts">Prompts</option>
                        <option value="Lore">Lore</option>
                        <option value="Articles">Articles</option>
                      </select>
                    </div>
                  </div>
 
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-neutral-500 uppercase">Text / References Content</label>
                    <textarea
                      id="new_mathom_content"
                      required
                      rows={3}
                      placeholder="Place draft text, recipe elements, prompts, or notes guidelines..."
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      className="bg-stone-900 border border-white/5 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#C5A059]/40 font-light resize-none"
                    />
                  </div>
 
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-neutral-500 uppercase">Parchment Tags (comma separated)</label>
                    <input
                      id="new_mathom_tags"
                      type="text"
                      placeholder="e.g. Copper, Hardware, Recipe"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      className="bg-stone-900 border border-white/5 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]/40 font-light"
                    />
                  </div>
 
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      id="btn_cancel_add_mathom"
                      type="button"
                      onClick={() => setIsAddOpen(false)}
                      className="cursor-pointer px-4 py-2 hover:bg-stone-800 rounded-lg text-xs text-neutral-400 transition-all font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn_submit_add_mathom"
                      type="submit"
                      className="cursor-pointer bg-[#C5A059] hover:bg-[#b08c48] text-neutral-955 font-semibold px-4 py-2 rounded-lg text-xs transition-all"
                    >
                      Archive Mathom
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
 
          {/* Mathom Cards Stream */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {filteredMathoms.length === 0 ? (
              <div className={`col-span-2 text-center text-xs py-12 italic border border-dashed rounded-xl transition-colors ${
                isDark ? "border-white/5 text-neutral-500" : "border-stone-300 text-stone-400"
              }`}>
                The library drawer is currently empty. Refine your query or list a custom file!
              </div>
            ) : (
              filteredMathoms.map((m) => (
                <motion.div
                  id={`mathom_card_${m.id}`}
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -4, scale: 1.012, borderColor: "rgba(197, 160, 89, 0.22)" }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 24
                  }}
                  className={`p-5 rounded-2xl flex flex-col justify-between group cursor-default shadow-lg transition-colors duration-300 ${
                    isDark 
                      ? "bg-[#12100E]/40 border border-white/5 group-hover:border-white/10" 
                      : "bg-stone-50/50 border border-stone-200/65 group-hover:border-stone-300 group-hover:bg-stone-50"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center gap-2 mb-3">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-mono border ${
                        isDark ? "bg-[#C5A059]/10 text-[#C5A059] border-white/5" : "bg-[#C5A059]/10 text-[#a07c30] border-stone-200/50"
                      }`}>
                        {m.category}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">{m.date}</span>
                    </div>
                    <h3 className={`text-base font-serif mb-2 group-hover:text-[#C5A059] transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-850"}`}>{m.title}</h3>
                    <p className={`text-xs font-light leading-relaxed mb-4 whitespace-pre-wrap transition-colors ${isDark ? "text-neutral-400" : "text-stone-600"}`}>
                      {m.content}
                    </p>
                  </div>

                  <div className={`flex items-center justify-between border-t pt-3 mt-3 transition-colors ${isDark ? "border-white/5" : "border-stone-200/60"}`}>
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((tag) => (
                        <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded font-mono border transition-colors ${
                          isDark 
                            ? "bg-[#2C251D]/60 border-white/5 text-[#C5A059]/80" 
                            : "bg-stone-100 border-stone-200 text-stone-550"
                        }`}>
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Tool Actions (e.g. Copy Prompt) */}
                    <button
                      id={`btn_copy_mathom_${m.id}`}
                      onClick={() => copyToClipboard(m.content, m.id)}
                      className={`cursor-pointer transition-all p-1.5 rounded-lg ${
                        isDark 
                          ? "text-neutral-500 hover:text-[#C5A059] hover:bg-[#2C251D]" 
                          : "text-stone-400 hover:text-[#a07c30] hover:bg-stone-100"
                      }`}
                      title={m.category === "Prompts" ? "Copy Prompt to Clipboard" : "Copy Note Contents"}
                    >
                      {copiedId === m.id ? (
                        <Check className="w-4 h-4 text-[#C5A059]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>
 
      {/* RIGHT: Fireplace Spirit / Archivist AI Panel */}
      <motion.div 
        whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className={`w-full lg:w-[400px] flex flex-col justify-between backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className={`p-6 border-b relative transition-all duration-500 ${isDark ? "border-white/5 bg-[#12100E]/40" : "border-stone-100 bg-stone-50/40"}`}>
          <div className="absolute top-4 right-4 text-[#C5A059] animate-pulse">
            <Flame className="w-5 h-5 fill-[#C5A059]/10 text-[#C5A059]" />
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
            <Flame className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>The Fire-Hearth</span>
          </div>
          <h2 className={`text-lg font-serif flex items-center gap-1.5 transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-850"}`}>
            The Fireplace Spirit
          </h2>
          <p className={`text-xs font-light leading-relaxed mt-2 transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Residing in the crackling flames of Mathoms is a silent library cataloger. Feed the flames an unstructured diary entry, thoughts, or prompt concepts to receive refined, literary catalog entries.
          </p>
        </div>
 
        {/* Console / Output Stream */}
        <div className={`flex-1 p-6 flex flex-col justify-between min-h-[280px] transition-colors duration-500 ${isDark ? "bg-neutral-950/20" : "bg-stone-50/30"}`}>
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[300px] pr-1 scrollbar-thin">
            {!spiritPrompt && !spiritResponse && !loadingSpirit && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-xl">
                <Flame className="w-8 h-8 text-neutral-600 mb-2 fill-current" />
                <span className="text-xs text-[#C5A059] font-mono">// FIREPLACE : GLOWING_SILENTLY</span>
                <p className="text-[11px] text-neutral-500 font-light mt-2 max-w-[240px]">
                  Describe a thought, quote, or note idea to polish with the Spirit's elegant, historical literary styling.
                </p>
              </div>
            )}
 
            {spiritPrompt && (
              <div className={`self-end max-w-[90%] p-3 rounded-2xl rounded-tr-none text-xs border transition-all ${
                isDark 
                  ? "bg-stone-800 text-neutral-200 border-white/5" 
                  : "bg-stone-250 text-stone-800 border-stone-200 bg-stone-200/50"
              }`}>
                <p className="font-mono text-[8px] text-[#C5A059] uppercase tracking-wider mb-1 font-bold">Your draft:</p>
                {spiritPrompt}
              </div>
            )}
 
            {loadingSpirit && (
              <div className={`self-start max-w-[90%] border p-3.5 rounded-2xl rounded-tl-none text-xs flex items-center gap-2 transition-colors ${
                isDark 
                  ? "bg-[#2C251D] border-white/5 text-neutral-400" 
                  : "bg-stone-100 border border-stone-200 text-stone-500"
              }`}>
                <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
                <span className="font-mono text-[9px] tracking-wider uppercase animate-pulse">Reading coal flickers...</span>
              </div>
            )}
 
            {spiritResponse && (
              <div className={`self-start max-w-[95%] border p-4 rounded-2xl rounded-tl-none text-xs leading-relaxed font-sans shadow-lg transition-colors ${
                isDark 
                  ? "bg-[#12100E] border-white/10 text-slate-100" 
                  : "bg-white border-stone-200/95 text-stone-800"
              }`}>
                <p className="font-mono text-[8.5px] text-[#C5A059] uppercase tracking-widest mb-2 font-bold flex items-center gap-1">
                  💡 Lit in embers · Archivist Verse
                </p>
                <div className={`whitespace-pre-wrap font-light border-l border-[#C5A059]/20 pl-3 italic font-serif transition-colors ${isDark ? "text-neutral-350" : "text-stone-600"}`}>
                  {spiritResponse}
                </div>
              </div>
            )}
 
            {spiritError && (
              <div className="self-start w-full bg-red-400/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-mono">
                {spiritError}
              </div>
            )}
          </div>
 
          {/* Quick Prompts */}
          {!loadingSpirit && (
            <div className={`mt-4 pt-4 border-t flex flex-col gap-1.5 ${isDark ? "border-white/5" : "border-stone-150"}`}>
              <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Ember Queries:</span>
              <div className="flex flex-col gap-1">
                {[
                  "Draft a quote about preserving books",
                  "Catalog Sweet Star-Clover",
                  "Hobbit house design prompt guidelines"
                ].map((p, idx) => (
                  <button
                    id={`spirit_prompt_${idx}`}
                    key={idx}
                    onClick={() => handleConsultSpirit(p)}
                    className={`cursor-pointer text-left text-[11px] p-2 rounded-lg transition-all flex items-center gap-1.5 font-light border ${
                      isDark 
                        ? "bg-[#12100E]/65 hover:bg-[#2C251D]/65 border-white/5 text-neutral-400 hover:text-[#C5A059]" 
                        : "bg-stone-100 hover:bg-stone-200 border-stone-200/60 text-stone-650 hover:text-stone-850"
                    }`}
                  >
                    <Flame className="w-2.5 h-2.5 text-[#C5A059]/40 fill-current" />
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
 
        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConsultSpirit(spiritPrompt);
          }}
          className={`p-4 border-t flex gap-2 transition-all duration-500 ${
            isDark 
              ? "border-white/5 bg-[#12100E]/90" 
              : "border-stone-200 bg-stone-50"
          }`}
        >
          <input
            id="input_spirit_prompt"
            type="text"
            value={spiritPrompt}
            onChange={(e) => setSpiritPrompt(e.target.value)}
            disabled={loadingSpirit}
            placeholder={isFireActive ? "Whisper a text idea to the hearth..." : "Ask the archivist spirit..."}
            className={`flex-1 px-4 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C5A059]/40 font-light transition-all ${
              isDark 
                ? "bg-stone-900 border border-white/5 text-slate-100" 
                : "bg-white border border-stone-200 text-stone-800"
            }`}
          />
          <button
            id="btn_submit_spirit"
            type="submit"
            disabled={loadingSpirit || !spiritPrompt.trim()}
            className="cursor-pointer bg-[#C5A059] hover:bg-[#b08c48] disabled:opacity-30 text-neutral-950 p-2.5 rounded-xl font-medium transition-all"
          >
            {loadingSpirit ? <Loader2 className="w-4 h-4 animate-spin animate-spin-slow" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
