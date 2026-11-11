// Som do passeio em frames (frames.html). Parte da mesma casa sonora da home (js/audio.js: pássaros,
// o tom dos cômodos, a lareira), sem o vento e sem a caixinha de música sintetizada: aqui toca a música
// (um arquivo), sem parar e em loop suave, independente da rolagem. A ambiência acompanha o caminho
// com crossfades, e alguns efeitos (a porta, o assoalho, a lenha, os pássaros na janela) disparam
// ao cruzar pontos do percurso.
import { Sound } from './audio.js';

// Nível de cada camada ao longo do percurso (0 = primeiro frame, 1 = último): pontos [posição, nível].
const CAMADAS = {
  natureza: [[0, 1], [0.12, 1], [0.24, 0.1], [0.78, 0.04], [0.88, 0.8], [1, 0.9]],
  casa: [[0, 0], [0.12, 0], [0.26, 1], [0.84, 1], [1, 0.6]],
  oficina: [[0, 0], [0.32, 0], [0.4, 1], [0.56, 1], [0.66, 0]],
  lareira: [[0, 0], [0.44, 0], [0.56, 0.4], [0.62, 1], [0.77, 1], [0.87, 0.1], [1, 0.04]],
};
// Efeitos pontuais: tocam ao cruzar `em` andando para a frente e só voltam a valer depois de recuar
// até `rearma` — oscilar a rolagem em volta do ponto não repete o som.
const EVENTOS = [
  { em: 0.084, rearma: 0.04, som: 'porta' },     // frame ~11: a porta redonda começa a abrir
  { em: 0.218, rearma: 0.17, som: 'tabua' },     // frame ~27: o primeiro passo no assoalho
  { em: 0.63, rearma: 0.56, som: 'lenha' },      // frame ~76: diante da lareira
  { em: 0.866, rearma: 0.8, som: 'passaros' },   // frame ~104: a janela aberta para o jardim
];
const MUSICA = 0.5;       // volume da música
const TROCA = 5;          // segundos de crossfade no loop da música

function nivel(pontos, p) {
  if (p <= pontos[0][0]) return pontos[0][1];
  for (let i = 1; i < pontos.length; i++) {
    const [x1, y1] = pontos[i];
    if (p <= x1) {
      const [x0, y0] = pontos[i - 1];
      return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0);
    }
  }
  return pontos[pontos.length - 1][1];
}

export class SomDoPasseio extends Sound {
  constructor(musica) {
    super();
    this.musica = musica;             // caminho sem extensão (ex.: assets/frames/musica)
    this.p = 0;
    this.eventos = EVENTOS.map((e) => ({ ...e, armado: true }));
    this._nextWood = 0;
  }

  _build() {
    super._build();
    const c = this.ctx;
    this.windGain.disconnect();       // nesta página, sem vento
    this.woodBus = c.createGain(); this.woodBus.gain.value = 0;
    this.woodBus.connect(this.master); this.woodBus.connect(this.verb);
    // a música: dois elementos <audio> (um entra enquanto o outro sai, no loop), sempre pelo Web Audio
    // (no iPhone, o volume de um <audio> não pode ser mudado direto)
    this.musicGain = c.createGain(); this.musicGain.gain.value = MUSICA;
    this.musicGain.connect(this.master);
    const tipo = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? 'm4a' : 'mp3';
    this.faixas = [0, 1].map(() => {
      const el = new Audio(`${this.musica}.${tipo}`);
      el.preload = 'auto';
      const g = c.createGain(); g.gain.value = 0;
      c.createMediaElementSource(el).connect(g).connect(this.musicGain);
      const faixa = { el, g, livre: false };
      el.addEventListener('ended', () => { if (faixa === this.faixas[this.atual]) this._trocar(0.5); });
      return faixa;
    });
    this.atual = 0;
    this.trocando = false;
  }

  // Precisa ser chamado dentro de um gesto do usuário (clique, toque, tecla).
  enable() {
    super.enable();
    clearTimeout(this._pausa);
    const f = this.faixas[this.atual], t = this.ctx.currentTime;
    f.el.play().catch(() => {});
    f.g.gain.cancelScheduledValues(t);
    f.g.gain.setTargetAtTime(1, t, 0.8);
    // no iPhone, cada <audio> precisa de um gesto para tocar: libera a segunda faixa agora, em silêncio
    for (const o of this.faixas) {
      if (o === f || o.livre) continue;
      o.livre = true;
      o.el.play().then(() => { if (o !== this.faixas[this.atual] && !this.trocando) o.el.pause(); }).catch(() => { o.livre = false; });
    }
  }

  disable() {
    super.disable();
    clearTimeout(this._pausa);
    this._pausa = setTimeout(() => { if (!this.enabled) for (const f of this.faixas || []) f.el.pause(); }, 700);
  }

  // Aba escondida: tudo para; ao voltar, continua de onde estava.
  pausar() {
    if (!this.ctx) return;
    for (const f of this.faixas) f.el.pause();
    this.ctx.suspend();
  }

  retomar() {
    if (!this.ctx || !this.enabled) return;
    this.ctx.resume();
    this.faixas[this.atual].el.play().catch(() => {});
  }

  // Loop suave: perto do fim da música, a outra faixa começa do início e as duas se cruzam.
  _trocar(duracao = TROCA) {
    const velha = this.faixas[this.atual], nova = this.faixas[1 - this.atual], t = this.ctx.currentTime;
    this.trocando = true;
    this.atual = 1 - this.atual;
    nova.el.currentTime = 0;
    nova.el.play().catch(() => {});
    nova.g.gain.cancelScheduledValues(t); nova.g.gain.setValueAtTime(0, t); nova.g.gain.linearRampToValueAtTime(1, t + duracao);
    velha.g.gain.cancelScheduledValues(t); velha.g.gain.setValueAtTime(velha.g.gain.value, t); velha.g.gain.linearRampToValueAtTime(0, t + duracao);
    setTimeout(() => { velha.el.pause(); velha.el.currentTime = 0; this.trocando = false; }, duracao * 1000 + 300);
  }

  // Muda um volume só quando o alvo muda de verdade (e não a cada quadro da tela).
  _alvo(param, valor, tempo) {
    if (Math.abs((param._alvo ?? -1) - valor) < 0.002) return;
    param._alvo = valor;
    param.setTargetAtTime(valor, this.ctx.currentTime, tempo);
  }

  // Mistura de acordo com o lugar do percurso: p de 0 a 1 (a posição do frame na tela) e a velocidade
  // do passeio, em percursos inteiros por segundo.
  update(p, velocidade = 0) {
    const anterior = this.p;
    this.p = p;
    // efeitos pontuais (o estado dos gatilhos anda mesmo com o som desligado); passando muito rápido
    // (barra de rolagem, rolagem forte), ficam quietos
    for (const e of this.eventos) {
      if (e.armado && anterior < e.em && p >= e.em) {
        e.armado = false;
        if (velocidade < 0.7 && this.ctx && this.enabled) this[e.som]();
      } else if (!e.armado && p < e.rearma) e.armado = true;
    }
    if (!this.ctx || !this.enabled) return;

    const c = this.ctx, now = c.currentTime;
    const nat = nivel(CAMADAS.natureza, p), casa = nivel(CAMADAS.casa, p);
    const ofi = nivel(CAMADAS.oficina, p), lar = nivel(CAMADAS.lareira, p);
    this._alvo(this.birdBus.gain, 0.6 * nat, 0.8);
    this._alvo(this.roomGain.gain, 0.26 * casa, 0.8);
    this._alvo(this.fireGain.gain, 0.3 * lar, 0.8);
    this._alvo(this.crackleBus.gain, 0.8 * lar, 0.8);
    this._alvo(this.woodBus.gain, 0.9 * ofi, 0.8);

    if (lar > 0.02 && now > this._nextCrackle) { this._crackle(); this._nextCrackle = now + 0.03 + Math.random() * Math.random() * 0.45; }
    if (nat > 0.08 && now > this._nextBird) { this._bird(); this._nextBird = now + (1.8 + Math.random() * 5) / Math.max(0.35, nat); }
    if (ofi > 0.12 && now > this._nextWood) { this._madeira(); this._nextWood = now + 1.3 + Math.random() * 3.6; }

    // loop da música
    const f = this.faixas[this.atual];
    if (!this.trocando && f.el.duration && !f.el.paused && f.el.currentTime > Math.min(f.el.duration - 7, 166)) this._trocar();
  }

  // ─── sons de madeira ───
  // Uma batida seca de madeira (bloco, bancada, trinco).
  _toc(t, freq, gain, bus) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.62, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.13);
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 3.2; f.Q.value = 2.5;
    const g2 = c.createGain(); g2.gain.setValueAtTime(gain * 0.6, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(f).connect(g2).connect(bus); s.start(t, Math.random() * 0.8, 0.05);
  }

  // Um rangido: atrito (dente de serra lento) num filtro ressonante que desliza.
  _rangido(t, dur, base, formante, gain, bus) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.6, t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(base * 1.15, t + dur * 0.7);
    o.frequency.linearRampToValueAtTime(base * 1.45, t + dur);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 6 + Math.random() * 4; lg.gain.value = base * 0.12;
    lfo.connect(lg).connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 9;
    f1.frequency.setValueAtTime(formante, t); f1.frequency.linearRampToValueAtTime(formante * 1.5, t + dur * 0.5); f1.frequency.linearRampToValueAtTime(formante * 1.15, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 12; f2.frequency.value = formante * 2.3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.12);
    g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(bus);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // Oficina: uma ferramenta pousada na bancada, um banquinho, a madeira estalando.
  _madeira() {
    const t = this.ctx.currentTime + 0.02;
    if (Math.random() < 0.3) this._rangido(t, 0.35 + Math.random() * 0.3, 70 + Math.random() * 40, 380 + Math.random() * 200, 0.06, this.woodBus);
    else {
      const n = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < n; i++) this._toc(t + i * (0.12 + Math.random() * 0.1), 420 + Math.random() * 500, 0.08 + Math.random() * 0.06, this.woodBus);
    }
  }

  // ─── efeitos pontuais ───
  porta() {
    const t = this.ctx.currentTime + 0.03;
    this._toc(t, 780, 0.35, this.fxBus);                       // o trinco
    this._rangido(t + 0.12, 1.7, 40, 720, 0.22, this.fxBus);    // a dobradiça
  }

  tabua() {
    const t = this.ctx.currentTime + 0.02;
    this._rangido(t, 0.55, 85, 420, 0.1, this.fxBus);
    this._toc(t + 0.05, 180, 0.25, this.fxBus);
  }

  lenha() {
    const c = this.ctx, t = c.currentTime;
    // um tronco que assenta: um baque surdo e uma chuva de estalos
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(f).connect(g).connect(this.fxBus); s.start(t, 0, 0.4);
    for (let i = 0; i < 12; i++) setTimeout(() => { if (this.enabled) this._crackle(); }, 60 + Math.random() * 900);
  }

  passaros() {
    for (let i = 0; i < 3; i++) setTimeout(() => { if (this.enabled) this._bird(); }, i * (350 + Math.random() * 500));
  }
}
