// Som da casa, todo sintetizado (nenhum arquivo de áudio):
// vento, pássaros, fogo crepitando, o silêncio morno dos cômodos
// e uma caixinha de música que toca devagar.

const PENTA = [293.66, 329.63, 369.99, 440.0, 493.88]; // ré maior pentatônica

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.mix = { wind: 0, room: 0, fire: 0, birds: 0, music: 0 };
    this._nextBird = 0; this._nextNote = 0; this._nextCrackle = 0;
    this._ksCache = new Map();
  }

  // Precisa ser chamado dentro de um gesto do usuário.
  enable() {
    if (!this.ctx) this._build();
    this.ctx.resume();
    this.enabled = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.9, t, 0.8);
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.25);
  }

  _noiseBuffer(seconds, color) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
      else d[i] = w;
    }
    return buf;
  }

  _loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true;
    s.start(0, Math.random() * buffer.duration);
    return s;
  }

  _build() {
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);

    // Reverberação gerada (sala de madeira e terra).
    this.verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.master);

    const brown = this._noiseBuffer(6, 'brown');
    const pink = this._noiseBuffer(5, 'pink');
    this.white = this._noiseBuffer(1, 'white');

    // Vento
    const wind = this._loop(brown);
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 420; this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Tom do cômodo
    const room = this._loop(pink);
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220;
    this.roomGain = c.createGain(); this.roomGain.gain.value = 0;
    room.connect(rf).connect(this.roomGain).connect(this.master);

    // Fogo (rugido baixo + estalos)
    const roar = this._loop(brown);
    const ff = c.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 320;
    this.fireGain = c.createGain(); this.fireGain.gain.value = 0;
    roar.connect(ff).connect(this.fireGain).connect(this.master);
    this.crackleBus = c.createGain(); this.crackleBus.gain.value = 0;
    this.crackleBus.connect(this.master);
    this.crackleBus.connect(this.verb);

    this.birdBus = c.createGain(); this.birdBus.gain.value = 0;
    this.birdBus.connect(this.master); this.birdBus.connect(this.verb);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master); this.musicBus.connect(this.verb);
    this.fxBus = c.createGain(); this.fxBus.gain.value = 0.9;
    this.fxBus.connect(this.master); this.fxBus.connect(this.verb);
  }

  // Mistura de acordo com o lugar da casa.
  update(t, scene, speed) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, now = c.currentTime;
    const m = {
      door: { wind: 0.22, room: 0.0, fire: 0.0, crackle: 0.0, birds: 0.55, music: 0.5 },
      hall: { wind: 0.1, room: 0.24, fire: 0.0, crackle: 0.05, birds: 0.18, music: 0.5 },
      wright: { wind: 0.05, room: 0.28, fire: 0.04, crackle: 0.15, birds: 0.08, music: 0.55 },
      mathom: { wind: 0.02, room: 0.3, fire: 0.3, crackle: 0.8, birds: 0.0, music: 0.6 },
      worldrim: { wind: 0.3, room: 0.1, fire: 0.0, crackle: 0.05, birds: 0.4, music: 0.75 },
    }[scene] || {};
    const rush = Math.min(1, speed * 0.8);
    this.windGain.gain.setTargetAtTime((m.wind || 0) + rush * 0.25, now, 0.4);
    this.windFilter.frequency.setTargetAtTime(380 + rush * 900 + Math.sin(now * 0.2) * 80, now, 0.3);
    this.roomGain.gain.setTargetAtTime(m.room || 0, now, 0.6);
    this.fireGain.gain.setTargetAtTime(m.fire || 0, now, 0.6);
    this.crackleBus.gain.setTargetAtTime(m.crackle || 0, now, 0.6);
    this.birdBus.gain.setTargetAtTime(m.birds || 0, now, 0.8);
    this.musicBus.gain.setTargetAtTime((m.music || 0) * 0.22, now, 1.2);

    if (now > this._nextCrackle) { this._crackle(); this._nextCrackle = now + 0.03 + Math.random() * Math.random() * 0.45; }
    if (now > this._nextBird) { this._bird(); this._nextBird = now + 1.8 + Math.random() * 5; }
    if (now > this._nextNote) {
      this._note(scene === 'worldrim');
      this._nextNote = now + (scene === 'worldrim' ? 1.6 : 2.4) + Math.random() * 2.6;
    }
  }

  _crackle() {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 3500; f.Q.value = 1.4;
    const g = c.createGain();
    const a = 0.12 + Math.random() * 0.5;
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * 0.05);
    s.connect(f).connect(g).connect(this.crackleBus);
    s.start(t, Math.random() * 0.9, 0.08);
  }

  _bird() {
    const c = this.ctx, t = c.currentTime;
    const n = 2 + Math.floor(Math.random() * 5);
    const base = 2600 + Math.random() * 1800;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const out = c.createGain(); out.gain.value = 0.05 + Math.random() * 0.05;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.birdBus); } else out.connect(this.birdBus);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      const st = t + i * (0.09 + Math.random() * 0.06);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), st);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), st + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, st + 0.09);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(1, st + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.1);
      o.connect(g).connect(out);
      o.start(st); o.stop(st + 0.12);
    }
  }

  // Corda dedilhada (Karplus-Strong) pré-calculada.
  _pluckBuffer(freq, bright = 0.5, dur = 2.4) {
    const key = `${freq.toFixed(1)}-${bright}`;
    if (this._ksCache.has(key)) return this._ksCache.get(key);
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur);
    const buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const period = Math.round(sr / freq);
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    const damp = 0.4981 + bright * 0.0017;
    for (let i = 0; i < n; i++) {
      const cur = ring[idx];
      const next = (cur + prev) * damp;
      prev = cur;
      ring[idx] = next;
      d[i] = cur * 0.6;
      idx = (idx + 1) % period;
    }
    this._ksCache.set(key, buf);
    return buf;
  }

  _pluck(freq, when, gain, bus, bright) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this._pluckBuffer(freq, bright);
    const g = c.createGain(); g.gain.value = gain;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400 + bright * 3000;
    s.connect(f).connect(g).connect(bus);
    s.start(when);
  }

  _note(open) {
    const c = this.ctx, t = c.currentTime;
    const oct = Math.random() < 0.3 ? 2 : 1;
    const f = PENTA[Math.floor(Math.random() * PENTA.length)] * oct;
    this._pluck(f, t, 0.5, this.musicBus, 0.3);
    if (open && Math.random() < 0.5) this._pluck(f * 1.5, t + 0.18, 0.3, this.musicBus, 0.3);
    if (Math.random() < 0.25) this._pluck(f / 2, t + 0.02, 0.35, this.musicBus, 0.1);
  }

  // ─── sons de interação ───
  lute() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const chords = [[146.83, 220, 293.66, 369.99], [164.81, 246.94, 329.63, 392], [196, 246.94, 293.66, 392]];
    const ch = chords[Math.floor(Math.random() * chords.length)];
    ch.forEach((f, i) => this._pluck(f, t + i * 0.045, 0.8, this.fxBus, 0.7));
  }

  knock() {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const st = t + i * 0.22 + (i === 2 ? 0.05 : 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, st); o.frequency.exponentialRampToValueAtTime(70, st + 0.12);
      g.gain.setValueAtTime(0.9, st); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
      o.connect(g).connect(this.fxBus); o.start(st); o.stop(st + 0.22);
      const s = c.createBufferSource(); s.buffer = this.white;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.5, st); g2.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      s.connect(f).connect(g2).connect(this.fxBus); s.start(st, 0, 0.06);
    }
  }

  whoosh(amount = 1) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.7); f.frequency.exponentialRampToValueAtTime(400, t + 1.6);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * amount, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    s.connect(f).connect(g).connect(this.fxBus); s.start(t); s.stop(t + 1.8);
  }

  tick() {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 1760 + Math.random() * 400;
    g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.fxBus); o.start(t); o.stop(t + 0.16);
  }

  page() {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(f).connect(g).connect(this.fxBus); s.start(t, 0, 0.4);
  }
}
