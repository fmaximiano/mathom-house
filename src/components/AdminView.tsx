import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Plus, Trash2, Pencil, Save, Scroll, Hammer, Archive,
  Telescope, Lock, KeyRound, Check, AlertTriangle,
} from "lucide-react";
import { RiddleItem, ProjectItem, MathomItem, SecretSpot } from "../types";
import {
  getRiddles, saveRiddles,
  getProjects, saveProjects,
  getMathoms, saveMathoms,
  getSecrets, saveSecrets,
  getAdminPin, setAdminPin,
} from "../storage";

type AdminTab = "riddles" | "projects" | "mathoms" | "secrets";

interface AdminViewProps {
  onClose: () => void;
  isDark: boolean;
}

export default function AdminView({ onClose, isDark }: AdminViewProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    const storedPin = getAdminPin();
    setIsFirstTime(!storedPin);
    if (!storedPin) setAuthenticated(false);
  }, []);

  function handleLogin() {
    const stored = getAdminPin();
    if (stored && pin === stored) {
      setAuthenticated(true);
      setPinError("");
    } else {
      setPinError("Incorrect PIN. Try again.");
    }
  }

  function handleSetPin() {
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirmPin) {
      setPinError("PINs do not match.");
      return;
    }
    setAdminPin(pin);
    setAuthenticated(true);
    setPinError("");
  }

  if (!authenticated) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl ${
            isDark ? "bg-[#1A1714] border border-white/10 text-neutral-100" : "bg-white border border-stone-200 text-stone-800"
          }`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-[#C5A059]" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif">Admin Chambers</h2>
              <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
                {isFirstTime ? "Set your access PIN" : "Enter your PIN to proceed"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && (isFirstTime ? handleSetPin() : handleLogin())}
              placeholder={isFirstTime ? "Create PIN (min 4 chars)" : "Enter PIN"}
              className={`w-full px-4 py-3 rounded-xl text-sm font-mono outline-none transition-all ${
                isDark
                  ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
                  : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
              }`}
            />

            {isFirstTime && (
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value); setPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
                placeholder="Confirm PIN"
                className={`w-full px-4 py-3 rounded-xl text-sm font-mono outline-none transition-all ${
                  isDark
                    ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
                    : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
                }`}
              />
            )}

            {pinError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {pinError}
              </p>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={onClose}
                className={`cursor-pointer flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isDark ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-300" : "bg-stone-100 hover:bg-stone-200 text-stone-600"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={isFirstTime ? handleSetPin : handleLogin}
                className="cursor-pointer flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all"
              >
                {isFirstTime ? "Set PIN" : "Enter"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return <AdminPanel onClose={onClose} isDark={isDark} />;
}

function AdminPanel({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [tab, setTab] = useState<AdminTab>("riddles");

  const tabs: { id: AdminTab; label: string; icon: typeof Scroll }[] = [
    { id: "riddles", label: "Riddles", icon: Scroll },
    { id: "projects", label: "Projects", icon: Hammer },
    { id: "mathoms", label: "Mathoms", icon: Archive },
    { id: "secrets", label: "Secrets", icon: Telescope },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className={`m-4 md:m-8 flex-1 flex flex-col rounded-3xl shadow-2xl overflow-hidden ${
          isDark ? "bg-[#1A1714] border border-white/10 text-neutral-100" : "bg-[#FAFAF8] border border-stone-200 text-stone-800"
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isDark ? "border-white/5" : "border-stone-200"}`}>
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-[#C5A059]" />
            <h1 className="text-lg font-bold font-serif">Admin Chambers</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-[#12100E]/80" : "bg-stone-100"}`}>
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`cursor-pointer relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      tab === t.id
                        ? "text-[#C5A059]"
                        : isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"
                    }`}
                  >
                    {tab === t.id && (
                      <motion.div
                        layoutId="admin-tab-pill"
                        className="absolute inset-0 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-lg"
                      />
                    )}
                    <Icon className="w-3.5 h-3.5 relative z-10" />
                    <span className="relative z-10 hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </nav>
            <button onClick={onClose} className={`cursor-pointer p-2 rounded-xl transition-all ${isDark ? "hover:bg-white/5" : "hover:bg-stone-100"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {tab === "riddles" && <RiddlesAdmin isDark={isDark} />}
          {tab === "projects" && <ProjectsAdmin isDark={isDark} />}
          {tab === "mathoms" && <MathomsAdmin isDark={isDark} />}
          {tab === "secrets" && <SecretsAdmin isDark={isDark} />}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// RIDDLES ADMIN
// ============================================================

function RiddlesAdmin({ isDark }: { isDark: boolean }) {
  const [riddles, setRiddles] = useState<RiddleItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", hint: "" });

  useEffect(() => { setRiddles(getRiddles()); }, []);

  function persist(updated: RiddleItem[]) {
    setRiddles(updated);
    saveRiddles(updated);
    window.dispatchEvent(new Event("riddles-updated"));
  }

  function handleAdd() {
    if (!form.question.trim() || !form.answer.trim()) return;
    const newItem: RiddleItem = {
      id: `r_${Date.now()}`,
      question: form.question.trim(),
      answer: form.answer.trim(),
      hint: form.hint.trim() || undefined,
    };
    persist([...riddles, newItem]);
    setForm({ question: "", answer: "", hint: "" });
  }

  function handleDelete(id: string) {
    persist(riddles.filter((r) => r.id !== id));
  }

  function handleEdit(r: RiddleItem) {
    setEditing(r.id);
    setForm({ question: r.question, answer: r.answer, hint: r.hint || "" });
  }

  function handleSaveEdit() {
    if (!editing) return;
    persist(riddles.map((r) =>
      r.id === editing
        ? { ...r, question: form.question.trim(), answer: form.answer.trim(), hint: form.hint.trim() || undefined }
        : r
    ));
    setEditing(null);
    setForm({ question: "", answer: "", hint: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ question: "", answer: "", hint: "" });
  }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#C5A059]" />
          {editing ? "Edit Riddle" : "Add New Riddle"}
        </h3>
        <div className="flex flex-col gap-2">
          <textarea
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            placeholder="The riddle question..."
            rows={2}
            className={inputCls}
          />
          <input
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            placeholder="Answer"
            className={inputCls}
          />
          <input
            value={form.hint}
            onChange={(e) => setForm({ ...form, hint: e.target.value })}
            placeholder="Hint (optional)"
            className={inputCls}
          />
          <div className="flex gap-2 mt-1">
            {editing && (
              <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>
                Cancel
              </button>
            )}
            <button
              onClick={editing ? handleSaveEdit : handleAdd}
              className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5"
            >
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? "Save Changes" : "Add Riddle"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {riddles.map((r, i) => (
          <motion.div
            key={r.id}
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${
              isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-[#C5A059] mb-1">#{i + 1}</p>
              <p className={`text-sm leading-relaxed ${isDark ? "text-neutral-200" : "text-stone-700"}`}>
                {r.question}
              </p>
              <p className={`text-xs mt-1 font-mono ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
                Answer: {r.answer}
              </p>
              {r.hint && (
                <p className={`text-xs mt-0.5 italic ${isDark ? "text-neutral-600" : "text-stone-400"}`}>
                  Hint: {r.hint}
                </p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(r)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(r.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {riddles.length === 0 && (
        <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>
          No riddles yet. Add the first one above.
        </p>
      )}
    </div>
  );
}

// ============================================================
// PROJECTS ADMIN
// ============================================================

const PROJECT_CATEGORIES = ["Automation", "Web App", "AI Experiment", "Craft"] as const;

function ProjectsAdmin({ isDark }: { isDark: boolean }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "Automation" as ProjectItem["category"], tags: "", link: "" });

  useEffect(() => { setProjects(getProjects()); }, []);

  function persist(updated: ProjectItem[]) {
    setProjects(updated);
    saveProjects(updated);
  }

  function handleAdd() {
    if (!form.title.trim() || !form.description.trim()) return;
    const newItem: ProjectItem = {
      id: `p_${Date.now()}`,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      link: form.link.trim() || undefined,
    };
    persist([...projects, newItem]);
    setForm({ title: "", description: "", category: "Automation", tags: "", link: "" });
  }

  function handleDelete(id: string) {
    persist(projects.filter((p) => p.id !== id));
  }

  function handleEdit(p: ProjectItem) {
    setEditing(p.id);
    setForm({ title: p.title, description: p.description, category: p.category, tags: p.tags.join(", "), link: p.link || "" });
  }

  function handleSaveEdit() {
    if (!editing) return;
    persist(projects.map((p) =>
      p.id === editing
        ? { ...p, title: form.title.trim(), description: form.description.trim(), category: form.category, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), link: form.link.trim() || undefined }
        : p
    ));
    setEditing(null);
    setForm({ title: "", description: "", category: "Automation", tags: "", link: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ title: "", description: "", category: "Automation", tags: "", link: "" });
  }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#C5A059]" />
          {editing ? "Edit Project" : "Add New Project"}
        </h3>
        <div className="flex flex-col gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Project title" className={inputCls} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className={inputCls} />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ProjectItem["category"] })}
            className={inputCls}
          >
            {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className={inputCls} />
          <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Link (optional)" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && (
              <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>
            )}
            <button
              onClick={editing ? handleSaveEdit : handleAdd}
              className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5"
            >
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? "Save Changes" : "Add Project"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {projects.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${
              isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#C5A059]/10 text-[#C5A059]">{p.category}</span>
              </div>
              <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{p.title}</p>
              <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{p.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.tags.map((t) => (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? "bg-white/5 text-neutral-500" : "bg-stone-100 text-stone-500"}`}>{t}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(p)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(p.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {projects.length === 0 && (
        <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No projects yet.</p>
      )}
    </div>
  );
}

// ============================================================
// MATHOMS ADMIN
// ============================================================

const MATHOM_CATEGORIES = ["Prompts", "Lore", "Articles", "References"] as const;

function MathomsAdmin({ isDark }: { isDark: boolean }) {
  const [mathoms, setMathoms] = useState<MathomItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "Prompts" as MathomItem["category"], tags: "", sourceUrl: "" });

  useEffect(() => { setMathoms(getMathoms()); }, []);

  function persist(updated: MathomItem[]) {
    setMathoms(updated);
    saveMathoms(updated);
  }

  function handleAdd() {
    if (!form.title.trim() || !form.content.trim()) return;
    const newItem: MathomItem = {
      id: `m_${Date.now()}`,
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category,
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" }),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      sourceUrl: form.sourceUrl.trim() || undefined,
    };
    persist([...mathoms, newItem]);
    setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" });
  }

  function handleDelete(id: string) {
    persist(mathoms.filter((m) => m.id !== id));
  }

  function handleEdit(m: MathomItem) {
    setEditing(m.id);
    setForm({ title: m.title, content: m.content, category: m.category, tags: m.tags.join(", "), sourceUrl: m.sourceUrl || "" });
  }

  function handleSaveEdit() {
    if (!editing) return;
    persist(mathoms.map((m) =>
      m.id === editing
        ? {
            ...m, title: form.title.trim(), content: form.content.trim(), category: form.category,
            tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), sourceUrl: form.sourceUrl.trim() || undefined,
          }
        : m
    ));
    setEditing(null);
    setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" });
  }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#C5A059]" />
          {editing ? "Edit Mathom" : "Add New Mathom"}
        </h3>
        <div className="flex flex-col gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={inputCls} />
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content" rows={3} className={inputCls} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MathomItem["category"] })} className={inputCls}>
            {MATHOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className={inputCls} />
          <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="Source URL (optional)" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && (
              <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>
            )}
            <button
              onClick={editing ? handleSaveEdit : handleAdd}
              className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5"
            >
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? "Save Changes" : "Add Mathom"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {mathoms.map((m) => (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${
              isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#C5A059]/10 text-[#C5A059]">{m.category}</span>
                <span className={`text-[10px] ${isDark ? "text-neutral-600" : "text-stone-400"}`}>{m.date}</span>
              </div>
              <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{m.title}</p>
              <p className={`text-xs mt-1 line-clamp-2 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{m.content}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(m)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(m.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {mathoms.length === 0 && (
        <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No mathoms yet.</p>
      )}
    </div>
  );
}

// ============================================================
// SECRETS ADMIN
// ============================================================

function SecretsAdmin({ isDark }: { isDark: boolean }) {
  const [secrets, setSecrets] = useState<SecretSpot[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });

  useEffect(() => { setSecrets(getSecrets()); }, []);

  function persist(updated: SecretSpot[]) {
    setSecrets(updated);
    saveSecrets(updated);
  }

  function handleAdd() {
    if (!form.name.trim() || !form.description.trim()) return;
    const newItem: SecretSpot = {
      id: `s_${Date.now()}`,
      name: form.name.trim(),
      description: form.description.trim(),
      coordinates: { x: Number(form.x) || 50, y: Number(form.y) || 50 },
      link: form.link.trim() || undefined,
      revealText: form.revealText.trim(),
    };
    persist([...secrets, newItem]);
    setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });
  }

  function handleDelete(id: string) {
    persist(secrets.filter((s) => s.id !== id));
  }

  function handleEdit(s: SecretSpot) {
    setEditing(s.id);
    setForm({ name: s.name, description: s.description, x: String(s.coordinates.x), y: String(s.coordinates.y), link: s.link || "", revealText: s.revealText });
  }

  function handleSaveEdit() {
    if (!editing) return;
    persist(secrets.map((s) =>
      s.id === editing
        ? {
            ...s, name: form.name.trim(), description: form.description.trim(),
            coordinates: { x: Number(form.x) || 50, y: Number(form.y) || 50 },
            link: form.link.trim() || undefined, revealText: form.revealText.trim(),
          }
        : s
    ));
    setEditing(null);
    setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });
  }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#C5A059]" />
          {editing ? "Edit Secret Spot" : "Add New Secret Spot"}
        </h3>
        <div className="flex flex-col gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Spot name" className={inputCls} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className={inputCls} />
          <div className="flex gap-2">
            <input value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} placeholder="X coordinate (%)" type="number" min="0" max="100" className={inputCls} />
            <input value={form.y} onChange={(e) => setForm({ ...form, y: e.target.value })} placeholder="Y coordinate (%)" type="number" min="0" max="100" className={inputCls} />
          </div>
          <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Link (optional)" className={inputCls} />
          <input value={form.revealText} onChange={(e) => setForm({ ...form, revealText: e.target.value })} placeholder="Reveal text" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && (
              <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>
            )}
            <button
              onClick={editing ? handleSaveEdit : handleAdd}
              className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5"
            >
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? "Save Changes" : "Add Secret"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {secrets.map((s) => (
          <motion.div
            key={s.id}
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${
              isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{s.name}</p>
              <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{s.description}</p>
              <p className={`text-[10px] font-mono mt-1 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>
                Coords: ({s.coordinates.x}%, {s.coordinates.y}%)
                {s.link && ` | Link: ${s.link}`}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(s)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(s.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {secrets.length === 0 && (
        <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No secret spots yet.</p>
      )}
    </div>
  );
}
