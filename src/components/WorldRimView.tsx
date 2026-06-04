import { useState, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, Compass, Send, Check, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { TELESCOPE_SECRETS } from "../data";
import { SecretSpot } from "../types";

interface WorldRimViewProps {
  isFireActive?: boolean;
}

export default function WorldRimView({ isFireActive = true }: WorldRimViewProps) {
  const isDark = !isFireActive;
  const [selectedSpot, setSelectedSpot] = useState<SecretSpot | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panCoordinates, setPanCoordinates] = useState({ x: 50, y: 50 });

  // Post bird mailer states
  const [senderName, setSenderName] = useState<string>("");
  const [mailSubject, setMailSubject] = useState<string>("");
  const [scrollMsg, setScrollMsg] = useState<string>("");
  const [birdsFlying, setBirdsFlying] = useState<boolean>(false);
  const [mailStatus, setMailStatus] = useState<string>("");

  const handleSpotClick = (spot: SecretSpot) => {
    setSelectedSpot(spot);
    // Align viewport zoom around coordinates to simulate spatial panning
    setZoomLevel(1.5);
    setPanCoordinates({ x: spot.coordinates.x, y: spot.coordinates.y });
  };

  const resetViewfinder = () => {
    setSelectedSpot(null);
    setZoomLevel(1);
    setPanCoordinates({ x: 50, y: 50 });
  };

  const handleSendRaven = (e: FormEvent) => {
    e.preventDefault();
    if (!senderName.trim() || !scrollMsg.trim()) return;

    setBirdsFlying(true);
    setMailStatus("");

    // Simulate carrier raven flight taking off over the green hills
    setTimeout(() => {
      setBirdsFlying(false);
      setMailStatus("🕊️ Wings aligned! Your postal raven has taken flight over the Southfarthing Downs, delivering your scroll securely.");
      setSenderName("");
      setMailSubject("");
      setScrollMsg("");
    }, 2800);
  };

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-stretch h-full w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* LEFT: Telescope Viewfinder Platform */}
      <div className="flex-1 flex flex-col gap-6">
        <motion.div 
          whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className={`backdrop-blur-xl p-6 rounded-2xl flex flex-col h-full justify-between shadow-lg transition-all duration-500 ${
            isDark 
              ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
              : "bg-white/75 border border-stone-200/90 shadow-md text-stone-800"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
              <Compass className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Telescope Viewfinder</span>
            </div>
            <h2 className={`text-2xl font-serif transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-850"}`}>The Panoramic Lens</h2>
            <p className={`text-xs font-light mt-2 mb-4 transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
              Our circular window is equipped with a calibrated brass telescope finder. Scan the distant hills for glowing yellow focal marks, and hover index details to read.
            </p>
          </div>
 
          {/* Interactive Window / Viewfinder frame */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-neutral-950 border border-white/5 flex items-center justify-center group shadow-inner">
            {/* Coordinates crosshair layer */}
            <div className="absolute inset-0 pointer-events-none border-2 border-white/5 z-30 m-4 rounded-xl flex items-center justify-center">
              {/* Outer crosshairs */}
              <div className="absolute w-[2px] h-12 bg-[#C5A059]/20 top-2" />
              <div className="absolute w-[2px] h-12 bg-[#C5A059]/20 bottom-2" />
              <div className="absolute h-[2px] w-12 bg-[#C5A059]/20 left-2" />
              <div className="absolute h-[2px] w-12 bg-[#C5A059]/20 right-2" />
              
              <div className="text-[9px] font-mono text-neutral-600 absolute bottom-3 right-3 select-none">
                AZIMUTH: {selectedSpot ? `${selectedSpot.coordinates.x}°N` : "CALIBRATING"}
              </div>
              <div className="text-[9px] font-mono text-neutral-600 absolute bottom-3 left-3 select-none">
                ALTITUDE: {selectedSpot ? `${selectedSpot.coordinates.y}°E` : "AUTO_LEVEL"}
              </div>
            </div>
 
            {/* Simulated Glass Refraction Circle */}
            <div className="absolute w-44 h-44 rounded-full border border-[#C5A059]/20 pointer-events-none z-20 shadow-[0_0_80px_rgba(197,160,89,0.04)]" />
 
            {/* Panoramic target container with spatial zooming motion */}
            <motion.div
              animate={{
                scale: zoomLevel,
                x: zoomLevel > 1 ? `${50 - panCoordinates.x}%` : "0%",
                y: zoomLevel > 1 ? `${50 - panCoordinates.y}%` : "0%",
              }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="absolute inset-0 z-10 w-full h-full"
            >
              <div className="relative w-full h-full flex items-center justify-center select-none pointer-events-none">
                <span className="text-neutral-800 text-[11px] font-mono opacity-20 uppercase tracking-widest text-center">
                  Look through the glass
                </span>
 
                {/* Hotspot triggers */}
                {TELESCOPE_SECRETS.map((spot) => (
                  <button
                    id={`hotspot_${spot.id}`}
                    key={spot.id}
                    onClick={() => handleSpotClick(spot)}
                    className="cursor-pointer absolute w-8 h-8 rounded-full flex items-center justify-center group/btn active:scale-95 pointer-events-auto transition-transform z-40"
                    style={{ left: `${spot.coordinates.x}%`, top: `${spot.coordinates.y}%` }}
                  >
                    {/* Ring ping animations */}
                    <span className="absolute w-full h-full rounded-full bg-[#C5A059]/30 animate-ping opacity-75" />
                    <span className="absolute w-5 h-5 rounded-full bg-[#C5A059]/20 group-hover/btn:bg-[#C5A059]/40 border border-[#C5A059]/60 z-10" />
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-[#C5A059] z-20 group-hover/btn:scale-125" />
                  </button>
                ))}
              </div>
            </motion.div>
 
            {/* Ambient Background Grid Overlay */}
            <div className="absolute inset-0 bg-radial from-transparent via-neutral-950/40 to-neutral-950/70 z-20 pointer-events-none" />
 
            {/* Scenic overlay instructions */}
            {!selectedSpot && (
              <div className="absolute top-4 left-4 z-30 bg-[#12100E]/90 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-[10px] text-neutral-450 font-mono flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#C5A059] animate-spin-slow" />
                <span>Interact with yellow glowing beacons above.</span>
              </div>
            )}
          </div>
 
          {/* Active spot description detail */}
          <div className={`mt-5 pt-5 border-t min-h-[100px] flex flex-col justify-between transition-colors duration-500 ${isDark ? "border-white/10" : "border-stone-200"}`}>
            <AnimatePresence mode="wait">
              {selectedSpot ? (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="max-w-xl">
                    <h3 className="text-base font-serif text-[#C5A059] flex items-center gap-1.5">
                      🕵️ Located Spot: {selectedSpot.name}
                    </h3>
                    <p className={`text-xs leading-relaxed font-light mt-1.5 transition-colors ${isDark ? "text-neutral-400" : "text-stone-605"}`}>
                      {selectedSpot.revealText} 
                    </p>
                    <p className={`text-[11px] leading-relaxed font-light mt-1 transition-colors ${isDark ? "text-neutral-550" : "text-stone-400"}`}>
                      {selectedSpot.description}
                    </p>
                  </div>
 
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      id="btn_reset_lens"
                      onClick={resetViewfinder}
                      className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
                        isDark 
                          ? "bg-stone-900 border-white/5 hover:bg-stone-850 text-neutral-300" 
                          : "bg-stone-100 border-stone-200 hover:bg-stone-200 text-stone-700"
                      }`}
                    >
                      Reset Focus
                    </button>
                    {selectedSpot.link && (
                      <a
                        id={`btn_visit_spot_${selectedSpot.id}`}
                        href={selectedSpot.link}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-[#C5A059] hover:bg-[#b08c48] text-neutral-955 font-bold px-4 py-2 rounded-xl text-xs transition-all tracking-wide flex items-center gap-1.5 shadow-lg"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Inspect Location</span>
                      </a>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-xs text-neutral-500 py-4 italic font-light flex items-center justify-center gap-2"
                >
                  <AlertCircle className={`w-4 h-4 ${isDark ? "text-neutral-600" : "text-stone-400"}`} />
                  <span>The lens is currently wide. No focal hotspots are active.</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
 
      {/* RIGHT: Post Bird Envelope Scroll Mailer */}
      <motion.div 
        whileHover={{ y: -2, borderColor: "rgba(197, 160, 89, 0.22)" }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className={`w-full xl:w-[420px] flex flex-col justify-between backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl relative transition-all duration-500 ${
          isDark 
            ? "bg-[#12100E]/70 border border-white/10 text-neutral-100" 
            : "bg-white/75 border border-stone-200/90 shadow-lg text-stone-800"
        }`}
      >
        <div className={`p-6 border-b relative transition-all duration-500 ${isDark ? "border-white/5 bg-[#12100E]/40" : "border-stone-100 bg-stone-50/40"}`}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] opacity-75 text-[#C5A059] font-mono mb-1">
            <Send className="w-3.5 h-3.5 animate-bounce" />
            <span>House Postbox</span>
          </div>
          <h2 className={`text-lg font-serif transition-colors ${isDark ? "text-[#E5E1D8]" : "text-stone-850"}`}>Post-Bird Mailer</h2>
          <p className={`text-xs font-light leading-relaxed mt-2 transition-colors ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
            Send a message over the downs to the keeper of Mathom House. Once sent, we will dispatch a mechanical-bird scroll containing your words.
          </p>
        </div>
 
        {/* Scroll Form Envelope */}
        <form onSubmit={handleSendRaven} className={`flex-1 p-6 flex flex-col justify-between transition-colors duration-500 ${isDark ? "bg-neutral-950/20" : "bg-stone-50/30"}`}>
          <div className="flex flex-col gap-4">
            {/* Sender */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-neutral-500 uppercase">Your Name / Title</label>
              <input
                id="mail_sender_name"
                type="text"
                required
                disabled={birdsFlying}
                placeholder="e.g. Master Bilbo of West Downs"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className={`rounded-xl p-3 text-xs focus:outline-none focus:border-[#C5A059]/40 font-light transition-all ${
                  isDark 
                    ? "bg-stone-900 border border-white/5 text-white" 
                    : "bg-white border border-stone-200 text-stone-800"
                }`}
              />
            </div>
 
            {/* Subject */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-neutral-500 uppercase">Subject / Correspondence</label>
              <input
                id="mail_subject"
                type="text"
                disabled={birdsFlying}
                placeholder="e.g. Joint project automation inquiries"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                className={`rounded-xl p-3 text-xs focus:outline-none focus:border-[#C5A059]/40 font-light transition-all ${
                  isDark 
                    ? "bg-stone-900 border border-white/5 text-white" 
                    : "bg-white border border-stone-200 text-stone-800"
                }`}
              />
            </div>
 
            {/* Message scroll */}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[10px] font-mono text-neutral-500 uppercase">Scroll Contents</label>
              <textarea
                id="mail_message"
                required
                rows={4}
                disabled={birdsFlying}
                placeholder="Inscribe your thoughts, links, or messages to the smith here..."
                value={scrollMsg}
                onChange={(e) => setScrollMsg(e.target.value)}
                className={`rounded-xl p-3 text-xs focus:outline-none focus:border-[#C5A059]/40 font-light resize-none font-serif leading-relaxed transition-all ${
                  isDark 
                    ? "bg-stone-900 border border-white/5 text-white" 
                    : "bg-white border border-stone-200 text-stone-800"
                }`}
              />
            </div>
          </div>
 
          {/* Flying Bird Animation Panel and Status */}
          <div className="mt-6">
            <AnimatePresence mode="wait">
              {birdsFlying ? (
                <motion.div
                  key="flying"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-4 border border-dashed border-[#C5A059]/20 bg-[#C5A059]/5 rounded-xl gap-2 animate-none"
                >
                  <motion.div
                    animate={{
                      y: [0, -10, 0],
                      x: [-40, 40, -40],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="text-2xl"
                  >
                    🕊️
                  </motion.div>
                  <span className="text-[10px] text-[#C5A059] font-mono uppercase animate-pulse tracking-widest font-bold">
                    Raven Wingbeats... Taking off over downhills
                  </span>
                </motion.div>
              ) : mailStatus ? (
                <motion.div
                  key="success"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="p-3.5 bg-[#C5A059]/10 border border-[#C5A059]/25 text-[#C5A059] text-xs rounded-xl leading-relaxed"
                >
                  {mailStatus}
                </motion.div>
              ) : (
                <div className="text-center text-[11px] text-neutral-550 italic pb-2 font-light">
                  Carrier ready. Draft your message scroll to fly.
                </div>
              )}
            </AnimatePresence>
 
            <button
              id="btn_send_mail"
              type="submit"
              disabled={birdsFlying || !senderName.trim() || !scrollMsg.trim()}
              className="cursor-pointer w-full bg-[#C5A059] hover:bg-[#b08c48] disabled:opacity-30 text-neutral-950 font-bold p-3 rounded-xl text-xs transition-all tracking-wider mt-4 flex items-center justify-center gap-2 shadow-lg"
            >
              {birdsFlying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>DISPATCHING Courier...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>LAUNCH CARRIER RAVEN</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
