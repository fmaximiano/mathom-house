// Mathom-house — o passeio em frames (frames.html): uma sequência de imagens (um vídeo de 10 s a 24 fps,
// quadro a quadro) que a rolagem percorre. Topo = primeiro frame; fim = último, com um trecho a mais de
// rolagem em que a câmera repousa diante da janela. Enquanto se rola, a imagem se funde de um frame no
// seguinte e a posição segue a rolagem com suavidade; quando a rolagem para, a câmera assenta num frame
// inteiro — nunca fica parada com duas imagens sobrepostas.
import { site, blocks, contacts, mathoms, secrets, hidden } from './content.js';
import { SomDoPasseio } from './frames-audio.js';
import { RITMO, RITMO_CELULAR, REPOUSO, OLHAR, LUNETA } from './frames-roteiro.js';
import { Conteudo } from './frames-conteudo.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
const params = new URLSearchParams(location.search);
const PASTA = 'assets/frames/';
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Economia de dados (pedida no navegador, ou conexão lenta): baixa um frame sim, um não.
const conexao = navigator.connection || {};
const economia = params.has('economia') || !!conexao.saveData || /(^|-)2g$|^3g$/.test(conexao.effectiveType || '');
// Quanto de memória os frames decodificados podem ocupar (o resto fica comprimido, bem menor).
const MEMORIA = (mobile ? 64 : 200) * 1e6;
const MISTURA = 4;          // funde dois frames se estão a no máximo esta distância (enquanto os do meio não chegam)
const PARADO = 110;         // ms sem rolar = a rolagem parou
const RAIO_NITIDEZ = 2;     // ao parar, pode preferir um frame mais nítido até ±2 quadros (≈83 ms a 24 fps)

const sound = new SomDoPasseio(PASTA + 'musica');
const tela = $('#stage');
const ctx = tela.getContext('2d', { alpha: false });

// ─── textos da entrada (os mesmos da home) ───────────────────────────────
$('.threshold__label').textContent = site.loading;
$('[data-enter="sound"]').textContent = site.enter;
$('[data-enter="silent"]').textContent = site.enterSilent;
$('.scroll-hint').insertAdjacentText('afterbegin', site.scrollHint);

// ─── os frames: baixados aos poucos, decodificados só perto de onde se está ─
class Frames {
  // conj: { pasta, w, h (em pixels da imagem), k (escala da imagem em relação ao vídeo), x (onde a imagem
  // começa no vídeo, em pixels do vídeo: a faixa do retrato), inteiro (decodificar a imagem toda) }
  constructor(n, conj, { passo, alcance, nitidez = [] }) {
    Object.assign(this, conj);
    this.n = n;
    this.passo = passo;                          // 1 = todos os frames; 2 = um sim, um não
    this.alcance = alcance;                      // até quantos frames à frente baixar (Infinity = todos)
    this.nitidez = nitidez;                       // scores pré-calculados (sharpness.json)
    this.bytes = new Array(n).fill(null);        // o arquivo comprimido (pequeno): fica em memória
    this.img = new Map();                        // i → { bmp, rc, gen }: decodificados (pesados), só na janela
    this.baixando = new Set();
    this.decodificando = new Set();
    this.falhas = new Array(n).fill(0);
    this.centro = 0;
    this.dir = 1;
    this.gen = 0;
    this.recorte = { x: 0, y: 0, w: this.w, h: this.h };
    this.janela = { frente: 12, tras: 6 };
    this.prioritarios = null;                    // durante a entrada: só os essenciais
    this.aoMudar = () => {};
  }

  url(i) { return `${this.pasta}frame_${String(i + 1).padStart(4, '0')}.webp`; }
  existe(i) { return i % this.passo === 0 || i === this.n - 1; }

  // O pedaço da imagem que aparece na tela (rc, em pixels da imagem). Decodificar só esse pedaço economiza
  // memória; a janela de frames decodificados é do tamanho que cabe na memória combinada.
  definirRecorte(rc) {
    if (this.inteiro) rc = { x: 0, y: 0, w: this.w, h: this.h };
    const a = this.recorte;
    const total = Math.max(10, Math.min(40, Math.floor(MEMORIA / (rc.w * rc.h * 4))));
    this.janela = { frente: Math.round(total * 0.7), tras: total - Math.round(total * 0.7) };
    if (Math.abs(rc.w - a.w) > 2 || Math.abs(rc.h - a.h) > 2 || Math.abs(rc.x - a.x) > 2 || Math.abs(rc.y - a.y) > 2) {
      this.recorte = rc; this.gen++; this.bombear();
    }
  }

  mover(alvo) {
    const c = Math.max(0, Math.min(this.n - 1, Math.round(alvo)));
    if (c !== this.centro) { this.dir = c > this.centro ? 1 : -1; this.centro = c; this.bombear(); }
  }

  // Prioridade de um frame: a distância à posição (o que fica para trás custa mais) e, antes dos
  // vizinhos imediatos, um de cada 8, de cada 4, de cada 2: com a rolagem rápida, nunca falta imagem.
  custo(i) {
    const d = i - this.centro;
    const dist = (d === 0 || Math.sign(d) === this.dir) ? Math.abs(d) : Math.abs(d) * 2.5;
    // Os vizinhos imediatos sempre ganham: buracos perto da posição atual são a principal causa
    // do pequeno "avança-volta-avança" quando um frame atrasado termina de carregar.
    if (Math.abs(d) <= 4) return dist;
    return dist + (i % 8 === 0 ? 0 : i % 4 === 0 ? 2 : i % 2 === 0 ? 4 : 6);
  }

  querBaixar(i) {
    if (!this.existe(i) || this.bytes[i] || this.baixando.has(i) || this.falhas[i] > 4) return false;
    if (this.alcance === Infinity || i % 8 === 0) return true;
    const d = (i - this.centro) * this.dir;
    return d >= -this.alcance / 3 && d <= this.alcance;
  }

  faixa() {
    const { frente, tras } = this.janela;
    return this.dir > 0 ? [this.centro - tras, this.centro + frente] : [this.centro - frente, this.centro + tras];
  }

  bombear() {
    // downloads: até 6 ao mesmo tempo, sempre os mais importantes primeiro
    const livres = 6 - this.baixando.size;
    if (livres > 0) {
      const lista = (this.prioritarios || [...this.bytes.keys()]).filter((i) => this.querBaixar(i));
      lista.sort((a, b) => this.custo(a) - this.custo(b));
      for (const i of lista.slice(0, livres)) this.baixar(i);
    }
    // decodificação: só dentro da janela, o mais próximo primeiro
    const [a, b] = this.faixa();
    const limite = mobile ? 2 : 3;
    while (this.decodificando.size < limite) {
      let melhor = -1, menor = Infinity;
      for (let i = Math.max(0, a); i <= Math.min(this.n - 1, b); i++) {
        const e = this.img.get(i);
        if (!this.bytes[i] || this.decodificando.has(i) || (e && e.gen === this.gen)) continue;
        const c = Math.abs(i - this.centro) * (Math.sign(i - this.centro) === -this.dir ? 2.5 : 1);
        if (c < menor) { menor = c; melhor = i; }
      }
      if (melhor < 0) break;
      this.decodificar(melhor);
    }
    // libera o que ficou longe (com folga, para não decodificar de novo a cada vaivém)
    const folga = 6;
    for (const [i, e] of this.img) {
      if (i < a - folga || i > b + folga) { if (e.bmp.close) e.bmp.close(); this.img.delete(i); }
    }
  }

  async baixar(i) {
    this.baixando.add(i);
    try {
      const r = await fetch(this.url(i));
      if (!r.ok) throw new Error(r.status);
      this.bytes[i] = await r.blob();
    } catch {
      this.falhas[i]++;
      await new Promise((ok) => setTimeout(ok, 800 * this.falhas[i]));
    }
    this.baixando.delete(i);
    this.aoMudar('baixou', i);
    this.bombear();
  }

  async decodificar(i) {
    this.decodificando.add(i);
    const gen = this.gen, rc = { ...this.recorte };
    let bmp = null, usado = rc;
    try {
      bmp = await createImageBitmap(this.bytes[i], rc.x, rc.y, rc.w, rc.h);
    } catch {
      try {   // navegador sem createImageBitmap (ou sem recorte): a imagem inteira
        const img = new Image();
        img.src = URL.createObjectURL(this.bytes[i]);
        await img.decode();
        URL.revokeObjectURL(img.src);
        bmp = img;
        usado = { x: 0, y: 0, w: this.w, h: this.h };
      } catch { /* arquivo com defeito: fica sem */ }
    }
    this.decodificando.delete(i);
    if (bmp) {
      const velho = this.img.get(i);
      if (velho && velho.bmp.close) velho.bmp.close();
      this.img.set(i, { bmp, rc: usado, gen });
      this.aoMudar('decodificou', i);
    }
    this.bombear();
  }

  // Ao parar, usa a medida pré-calculada no sharpness.json. A penalização de 10% por quadro
  // evita que uma variação natural de textura da cena faça a câmera "andar para trás" só por um ganho pequeno.
  maisNitido(f, raio = RAIO_NITIDEZ) {
    if (!this.nitidez.length) return -1;
    let melhor = -1, melhorNota = -Infinity, melhorDist = Infinity;
    const ini = Math.max(0, Math.round(f) - raio), fim = Math.min(this.n - 1, Math.round(f) + raio);
    for (let i = ini; i <= fim; i++) {
      const e = this.img.get(i), score = this.nitidez[i];
      if (!e || e.gen !== this.gen || !Number.isFinite(score)) continue;
      const dist = Math.abs(i - f);
      const nota = score / (1 + dist * 0.10);
      if (nota > melhorNota || (nota === melhorNota && dist < melhorDist)) {
        melhor = i; melhorNota = nota; melhorDist = dist;
      }
    }
    return melhor;
  }

  // Os frames decodificados mais próximos antes e depois de f (até `longe`); -1 se não há.
  vizinhos(f, longe = 8) {
    let a = -1, b = -1;
    for (let i = Math.floor(f); i >= Math.max(0, Math.floor(f) - longe); i--) if (this.img.has(i)) { a = i; break; }
    for (let i = Math.ceil(f); i <= Math.min(this.n - 1, Math.ceil(f) + longe); i++) if (this.img.has(i)) { b = i; break; }
    return [a, b];
  }

  maisPerto(i) {
    for (let d = 0; d < this.n; d++) {
      if (this.img.has(i + d * this.dir)) return i + d * this.dir;
      if (this.img.has(i - d * this.dir)) return i - d * this.dir;
    }
    return -1;
  }
}

// Qual conjunto baixar: em tela em pé, a faixa do retrato; senão, a menor largura que ainda tem a nitidez
// que a tela pede (?tamanho=1920|1280|960|retrato força um deles).
function escolherConjunto(info) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = innerWidth, ch = tela.clientHeight || innerHeight;
  const pedido = params.get('tamanho');
  const retrato = { pasta: `${PASTA}retrato/`, w: info.retrato.largura, h: info.altura, k: 1, x: info.retrato.x, inteiro: true, retrato: true };
  if (pedido === 'retrato' || (!pedido && info.retrato && cw / ch <= info.retrato.largura / info.altura + 0.02)) return retrato;
  const tamanhos = [...info.tamanhos].sort((a, b) => a - b);
  const precisa = info.largura * Math.max((cw * dpr) / info.largura, (ch * dpr) / info.altura);
  const l = +pedido || tamanhos.find((t) => t >= precisa * 0.85) || tamanhos[tamanhos.length - 1];
  return { pasta: `${PASTA}${l}/`, w: l, h: Math.round((info.altura * l) / info.largura), k: l / info.largura, x: 0, inteiro: false, retrato: false };
}

// Interpolação linear numa lista de pontos [x, y].
function curva(pontos, x) {
  if (x <= pontos[0][0]) return pontos[0][1];
  for (let i = 1; i < pontos.length; i++) {
    if (x <= pontos[i][0]) {
      const [x0, y0] = pontos[i - 1], [x1, y1] = pontos[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pontos[pontos.length - 1][1];
}

// ─── rolagem ─────────────────────────────────────────────────────────────
// Onde cada frame fica na rolagem, em telas desde o topo. O ritmo (frames por tela) muda de um trecho
// para o outro aos poucos: o ritmo de cada trecho vale no meio dele, e entre os meios ele desliza.
function mapaDoRitmo(n) {
  const escala = mobile ? RITMO_CELULAR : 1;
  const meios = [];
  let ini = 0;
  for (const [ate, porTela] of RITMO) { meios.push([(ini + ate) / 2, porTela]); ini = ate; }
  const telas = new Float64Array(n);
  for (let i = 1; i < n; i++) telas[i] = telas[i - 1] + escala / curva(meios, i - 0.5);
  const fim = telas[n - 1] + (REPOUSO.quadros / REPOUSO.porTela) * escala;
  return { telas, fim, escala };
}
const alturaTela = () => Math.max(1, tela.clientHeight);      // a tela é 100lvh: não muda com a barra do celular
const trecho = () => scrollY / alturaTela();                     // quantas telas já se rolou
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ─── som ─────────────────────────────────────────────────────────────────
const soundBtn = $('.chrome__sound');
function setSound(on) {
  if (on) sound.enable(); else sound.disable();
  soundBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('mathom-sound', on ? '1' : '0'); } catch { /* sem armazenamento */ }
}
soundBtn.addEventListener('click', () => setSound(!sound.enabled));
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.pausar(); else sound.retomar(); });

// ─── sussurros (pequenas descobertas) ────────────────────────────────────
const sussurroEl = $('.whisper');
let sussurroTimer;
function sussurrar(texto, ms = 3600) {
  sussurroEl.textContent = texto;
  sussurroEl.classList.add('is-on');
  clearTimeout(sussurroTimer);
  sussurroTimer = setTimeout(() => sussurroEl.classList.remove('is-on'), ms);
}
function travar(sim) { body.classList.toggle('is-locked', sim); }

// ─── viagem animada ("voltar à porta") ───────────────────────────────────
let viagem = null;
function irPara(y) {
  const de = scrollY, dist = Math.abs(y - de) / maxScroll();
  viagem = { de, para: y, inicio: performance.now(), dur: (reducedMotion ? 0.4 : 1.2 + dist * 3) * 1000 };
}
function passoDaViagem(agora) {
  if (!viagem) return;
  let u = Math.min(1, (agora - viagem.inicio) / viagem.dur);
  u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  window.scrollTo({ top: viagem.de + (viagem.para - viagem.de) * u, behavior: 'instant' });
  if (u >= 1) viagem = null;
}
['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { viagem = null; }, { passive: true }));
$('.chrome__mark').addEventListener('click', () => irPara(0));

// ─── início ──────────────────────────────────────────────────────────────
async function boot() {
  const [info, trilhas, sharpness] = await Promise.all([
    PASTA + 'frames.json',
    PASTA + 'trilhas.json',
  ].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }))
    .concat(fetch(PASTA + 'sharpness.json').then((r) => r.ok ? r.json() : null).catch(() => null)));
  const N = info.quadros, FW = info.largura, FH = info.altura;
  const nitidez = Array.from({ length: N }, (_, i) =>
    sharpness?.[`frame_${String(i + 1).padStart(4, '0')}.webp`] ?? null);
  const ritmo = mapaDoRitmo(N);
  const unidade = CSS.supports('height', '1lvh') ? 'lvh' : 'vh';
  $('#scroll-space').style.height = `${(1 + ritmo.fim) * 100}${unidade}`;

  // telas desde o topo → posição no passeio (q: frame; depois do último, o repouso)
  const { telas } = ritmo;
  function qDoTrecho(t) {
    if (t <= 0) return 0;
    if (t >= telas[N - 1]) return Math.min(N - 1 + REPOUSO.quadros, N - 1 + ((t - telas[N - 1]) / ritmo.escala) * REPOUSO.porTela);
    let a = 0, b = N - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (telas[m] <= t) a = m; else b = m; }
    return a + (t - telas[a]) / (telas[b] - telas[a]);
  }

  const conj = escolherConjunto(info);
  const quadros = new Frames(N, conj, {
    passo: economia ? 2 : 1,
    alcance: economia ? 48 : mobile ? 96 : Infinity,
    nitidez,
  });

  // ─── de ponto do vídeo para a tela (como object-fit: cover; em pé, a faixa acompanha o que interessa) ───
  const vista = {
    x0: 0, y0: 0, vw: FW, vh: FH, s: 1,
    tela(u, v) { return { x: (u * FW - this.x0) * this.s, y: (v * FH - this.y0) * this.s }; },
  };
  function enquadrar(f) {
    const cw = tela.clientWidth, ch = tela.clientHeight, A = cw / ch;
    const L = { x: conj.x, w: conj.w / conj.k };                 // o que existe no conjunto, em pixels do vídeo
    let vw = A < FW / FH ? FH * A : FW;
    vw = Math.min(vw, L.w);
    const vh = vw / A;
    const cx = conj.retrato ? curva(OLHAR, f) * FW : FW / 2;
    vista.x0 = Math.min(L.x + L.w - vw, Math.max(L.x, cx - vw / 2));
    vista.y0 = (FH - vh) / 2;
    vista.vw = vw; vista.vh = vh; vista.s = cw / vw;
  }

  let sujo = true, lido = 0, alturaLida = 0;
  function dimensionar() {
    // não perde o lugar no passeio ao girar o celular ou redimensionar a janela
    if (alturaLida && alturaTela() !== alturaLida) window.scrollTo(0, Math.round(lido * alturaTela()));
    alturaLida = alturaTela();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(tela.clientWidth * dpr), h = Math.round(tela.clientHeight * dpr);
    enquadrar(pos);
    if (!conj.inteiro) {
      const m = 2;   // o recorte decodificado: o que aparece na tela, com uma margem
      const x = Math.max(0, Math.floor(vista.x0 * conj.k) - m), y = Math.max(0, Math.floor(vista.y0 * conj.k) - m);
      quadros.definirRecorte({ x, y, w: Math.min(conj.w - x, Math.ceil(vista.vw * conj.k) + 2 * m), h: Math.min(conj.h - y, Math.ceil(vista.vh * conj.k) + 2 * m) });
    } else quadros.definirRecorte(null);
    conteudo && conteudo.medir();
    sujo = true;
    if (w === tela.width && h === tela.height) return;
    tela.width = w;
    tela.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  let pos = 0, conteudo = null;
  addEventListener('resize', dimensionar);
  dimensionar();

  // A entrada espera o começo do vídeo (meio segundo) e uma amostra do caminho todo (um frame por
  // segundo): dá para começar a rolar logo, e os demais chegam enquanto isso, na ordem de onde se está.
  const essenciais = [...new Set([...Array.from({ length: 12 }, (_, i) => i), ...Array.from({ length: Math.ceil(N / 24) }, (_, k) => Math.min(N - 1, k * 24))])]
    .filter((i) => quadros.existe(i));
  quadros.prioritarios = essenciais;
  const bar = $('.threshold__bar'), pct = $('.threshold__pct');
  let pronto = false;
  quadros.aoMudar = (tipo, i) => {
    if (tipo === 'decodificou' && Math.abs(i - pos) < MISTURA + 2) sujo = true;
    if (!pronto) {
      const feitos = essenciais.filter((k) => quadros.bytes[k]).length;
      const p = feitos / essenciais.length;
      bar.style.setProperty('--p', p.toFixed(3));
      pct.textContent = `${Math.round(p * 100)}%`;
      if (feitos === essenciais.length && quadros.img.has(0)) {
        pronto = true;
        quadros.prioritarios = null;
        quadros.bombear();
        abrirPorta();
      }
    }
  };
  quadros.bombear();

  // ─── o conteúdo da casa (textos, objetos, segredos) ───
  let inspecao = null, luneta = null;
  const zoom = { z: 1, alvo: 1, zMax: 1.05, px: 0, py: 0, mx: 0, my: 0 };
  conteudo = new Conteudo(trilhas, { blocks, contacts, mathoms, secrets, hidden, site }, sound, sussurrar, travar, {
    inicio: () => irPara(0),
    inspecionar: (p) => { inspecao = p; sujo = true; },
    luneta: (sim) => { luneta = sim; sujo = true; },
  });
  conteudo.medir();
  document.fonts && document.fonts.ready.then(() => conteudo.medir());
  const mouse = { x: 0, y: 0 }, mouseSuave = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  // O anel: digite "anel" (ou "ring") em qualquer lugar da casa.
  let digitado = '', anelTimer;
  addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    digitado = (digitado + e.key.toLowerCase()).slice(-6);
    if (digitado.endsWith('anel') || digitado.endsWith('ring')) {
      tela.classList.add('is-anel');
      sussurrar(secrets.ring, 5000);
      clearTimeout(anelTimer);
      anelTimer = setTimeout(() => tela.classList.remove('is-anel'), 7000);
    }
  });

  // ─── a porta espera ───
  let introStart = 0, comecou = false;
  function abrirPorta() {
    window.scrollTo(0, 0);
    window.mathomBooted = true;
    try { sessionStorage.removeItem('mathom-refresh'); } catch { /* */ }
    $('#threshold').classList.add('is-ready');
    let prevSound = null;
    try { prevSound = localStorage.getItem('mathom-sound'); } catch { /* */ }
    (prevSound === '0' ? $('[data-enter="silent"]') : $('[data-enter="sound"]')).focus({ preventScroll: true });
    if (params.has('enter')) entrar(false);
  }
  function entrar(comSom) {
    if (body.classList.contains('is-inside')) return;
    body.classList.remove('is-loading');
    body.classList.add('is-inside');
    if (comSom) setSound(true);
    introStart = performance.now();
    sujo = true;
    let visitas = 0;
    try { visitas = +(localStorage.getItem('mathom-visits') || 0); localStorage.setItem('mathom-visits', String(visitas + 1)); } catch { /* */ }
    // o recado de boas-vindas espera o passeio começar (para não cobrir o "role para entrar")
    const hora = new Date().getHours();
    if (hora >= 20 || hora < 5) boasVindas = [secrets.night, 5000];
    else if (visitas > 0) boasVindas = [secrets.welcomeBack, 4200];
  }
  let boasVindas = null;
  $('[data-enter="sound"]').addEventListener('click', () => entrar(true));
  $('[data-enter="silent"]').addEventListener('click', () => entrar(false));

  // ─── desenho: como object-fit: cover ───
  let intro = 0;
  function pintar(i, alfa) {
    const e = quadros.img.get(i), s = vista.s * (tela.width / tela.clientWidth);
    ctx.globalAlpha = alfa;
    ctx.drawImage(e.bmp, (e.rc.x / conj.k + conj.x - vista.x0) * s, (e.rc.y / conj.k - vista.y0) * s, (e.rc.w / conj.k) * s, (e.rc.h / conj.k) * s);
  }
  function desenhar() {
    const cw = tela.width, ch = tela.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, cw, ch);
    if (zoom.z > 1.0005) {
      // o livro aberto aproxima o objeto; a luneta aproxima a paisagem e a traz para o centro
      const k = tela.width / tela.clientWidth, u = Math.min(1, (zoom.z - 1) / (zoom.zMax - 1));
      const mx = zoom.px + (zoom.mx - zoom.px) * u, my = zoom.py + (zoom.my - zoom.py) * u;
      ctx.setTransform(zoom.z, 0, 0, zoom.z, (mx - zoom.z * zoom.px) * k, (my - zoom.z * zoom.py) * k);
    }
    // Só funde frames consecutivos. Se houver um buraco de download/decodificação, segura o último
    // quadro confirmado na direção do movimento em vez de saltar adiante e depois voltar quando o
    // intermediário chega — esse era o pequeno "engasgo" perceptível durante a rolagem.
    const [a, b] = quadros.vizinhos(pos);
    if (a >= 0 && b >= 0 && a !== b && b - a === 1) {
      pintar(a, 1);
      pintar(b, (pos - a) / (b - a));
    } else if (a >= 0 && b >= 0 && a !== b) {
      pintar(dirMov >= 0 ? a : b, 1);
    } else {
      const k = a >= 0 ? a : b >= 0 ? b : quadros.maisPerto(Math.round(pos));
      if (k >= 0) pintar(k, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // entrada: os olhos se acostumam à luz
    if (intro < 1) {
      ctx.globalAlpha = 1 - intro * intro * (3 - 2 * intro);
      ctx.fillStyle = '#0a0705';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.globalAlpha = 1;
  }

  // Onde assentar quando a rolagem para: parte do frame inteiro mais perto (um pouco a favor do movimento)
  // e, entre ±2 quadros já prontos, prefere o mais nítido. Em movimento a sequência continua intocada.
  function assento(f, dir) {
    const k = Math.max(0, Math.min(N - 1, Math.round(f + 0.15 * dir)));
    const nitido = quadros.maisNitido(k);
    if (nitido >= 0) return nitido;
    if (quadros.img.has(k)) return k;
    const [a, b] = quadros.vizinhos(f, MISTURA);
    if (a < 0 && b < 0) return k;
    if (a < 0) return b;
    if (b < 0) return a;
    return f - a <= b - f ? a : b;
  }

  // ─── laço ───
  const hint = $('.scroll-hint');
  let ultimo = performance.now(), anterior = 0, ultimoY = -1, ultimaRolagem = 0, dirMov = 1, qVis = 0, alvoAnterior = 0;
  let assentado = -1;      // o frame em que a câmera assentou (um toque de leve na rolagem não a tira dali)
  function quadro(agora) {
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    passoDaViagem(agora);
    if (introStart) {
      const novo = Math.min(1, (agora - introStart) / (reducedMotion ? 600 : 3000));
      if (novo !== intro) { intro = novo; sujo = true; }
    }
    if (scrollY !== ultimoY) { ultimoY = scrollY; ultimaRolagem = agora; }
    lido = trecho();
    alturaLida = alturaTela();
    const alvoQ = qDoTrecho(lido);
    let alvo = Math.min(N - 1, alvoQ);
    if (Math.abs(alvoQ - alvoAnterior) > 1e-4) { dirMov = alvoQ > alvoAnterior ? 1 : -1; alvoAnterior = alvoQ; }
    quadros.mover(alvo);
    // parada: a câmera assenta num frame inteiro (a fusão termina, nunca fica pela metade)
    const parado = agora - ultimaRolagem > PARADO && !viagem;
    if (reducedMotion) alvo = assento(alvo, dirMov);
    else if (parado && alvo < N - 1) alvo = assento(alvo, dirMov);
    else if (assentado >= 0 && Math.abs(alvo - assentado) < 0.35) alvo = assentado;
    else assentado = -1;
    // a rolagem anda aos saltos (rodinha, toque); a câmera segue macia
    const antes = pos;
    pos = reducedMotion ? alvo : pos + (alvo - pos) * (1 - Math.exp(-dt * (parado ? 12 : 9)));
    if (Math.abs(alvo - pos) < (parado ? 0.01 : 0.002)) pos = alvo;
    if (parado && Number.isInteger(pos) && pos === alvo) assentado = pos;
    qVis = reducedMotion ? alvoQ : qVis + (alvoQ - qVis) * (1 - Math.exp(-dt * 9));
    if (Math.abs(alvoQ - qVis) < 0.002) qVis = alvoQ;
    if (pos !== antes) { sujo = true; if (conj.retrato) enquadrar(pos); }

    // aproximação (livro de registros, luneta)
    const alvoZoom = luneta ? LUNETA.zoom : inspecao ? 1.05 : 1;
    if (alvoZoom !== zoom.alvo) {
      const cw = tela.clientWidth, ch = tela.clientHeight;
      if (luneta) {
        const p = vista.tela(LUNETA.u, LUNETA.v);
        Object.assign(zoom, { px: p.x, py: p.y, mx: cw / 2, my: ch / 2, zMax: LUNETA.zoom });
      } else if (inspecao) Object.assign(zoom, { px: inspecao.x, py: inspecao.y, mx: inspecao.x, my: inspecao.y, zMax: 1.05 });
      zoom.alvo = alvoZoom;
    }
    if (zoom.z !== zoom.alvo) {
      zoom.z += (zoom.alvo - zoom.z) * (1 - Math.exp(-dt * (reducedMotion ? 60 : 3.2)));
      if (Math.abs(zoom.alvo - zoom.z) < 0.001) zoom.z = zoom.alvo;
      sujo = true;
    }
    if (sujo) { desenhar(); sujo = false; }

    mouseSuave.x += (mouse.x - mouseSuave.x) * Math.min(1, dt * 3);
    mouseSuave.y += (mouse.y - mouseSuave.y) * Math.min(1, dt * 3);
    conteudo.atualizar(qVis, pos, vista, mouseSuave, dt);

    if (!comecou && scrollY > 24) {
      comecou = true;
      if (boasVindas) { const [texto, ms] = boasVindas; setTimeout(() => sussurrar(texto, ms), 1800); }
    }
    hint.classList.toggle('is-on', !comecou && intro > 0.8);
    const velocidade = Math.abs(pos - anterior) / Math.max(dt, 1e-3) / (N - 1);   // percursos por segundo
    anterior = pos;
    sound.update(pos / (N - 1), velocidade);
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
  window.mathomFrames = { quadros, get pos() { return pos; }, get q() { return qVis; }, sound, conteudo, vista, ritmo };   // para curiosos no console (e testes)
}

boot().catch((err) => {
  console.error(err);
  if (window.mathomRefresh && window.mathomRefresh()) return;
  $('.threshold__label').textContent = 'não foi possível acender as lanternas — recarregue a página';
  $('.threshold__pct').textContent = '';
});
