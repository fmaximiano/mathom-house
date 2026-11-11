// Mathom-house — ponto de entrada.
import { site, blocks, contacts, mathoms, secrets, hidden } from './content.js';
import { AREAS, SHOTS, STOPS, PAINTINGS } from './journey.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
if (!body.classList.contains('is-inside')) body.classList.add('is-loading');
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Comprimento do passeio, em alturas de tela.
const LENGTH = mobile ? 20 : 17;
// Rolagem contínua (padrão) ou por vistas (?vistas: cada gesto leva à foto seguinte).
const stepped = params.has('vistas');

const sound = new Sound();
let engine, blocksUI, curios;
let locked = false;
let travel = null;

// ─── texto da entrada ────────────────────────────────────────────────────
$('.threshold__label').textContent = site.loading;
$('[data-enter="sound"]').textContent = site.enter;
$('[data-enter="silent"]').textContent = site.enterSilent;
$('.scroll-hint').insertAdjacentText('afterbegin', site.scrollHint);

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

// ─── sussurros (pequenas descobertas) ────────────────────────────────────
const whisperEl = $('.whisper');
let whisperTimer;
function whisper(text, ms = 3600) {
  whisperEl.textContent = text;
  whisperEl.classList.add('is-on');
  clearTimeout(whisperTimer);
  whisperTimer = setTimeout(() => whisperEl.classList.remove('is-on'), ms);
}

// ─── rolagem ─────────────────────────────────────────────────────────────
const space = $('#scroll-space');
space.style.height = `${LENGTH * 100}${CSS.supports('height', '1lvh') ? 'lvh' : 'vh'}`;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const progress = () => (travel ? travel.value : scrollY / maxScroll());

function lock(on) {
  locked = on;
  body.classList.toggle('is-locked', on);
}

// Viagem animada (mapa, "voltar à porta"): a câmera percorre a casa inteira.
function travelTo(t) {
  const from = scrollY / maxScroll();
  const dist = Math.abs(t - from);
  const dur = reducedMotion ? 0.4 : 1.2 + dist * 4.2;
  travel = { from, to: t, start: performance.now(), dur: dur * 1000, value: from };
  sound.whoosh(Math.min(1, dist * 2));
}
function stepTravel(now) {
  if (!travel) return;
  let u = Math.min(1, (now - travel.start) / travel.dur);
  u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  travel.value = travel.from + (travel.to - travel.from) * u;
  window.scrollTo({ top: travel.value * maxScroll(), behavior: 'instant' });
  if (u >= 1) travel = null;
}
if (!stepped) ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { travel = null; }, { passive: true }));

// ─── rolagem por vistas ──────────────────────────────────────────────────
// Cada gesto leva à vista seguinte (ou anterior) e a câmera repousa ali.
const nearestStop = (t) => STOPS.reduce((best, s, i) => (Math.abs(s - t) < Math.abs(STOPS[best] - t) ? i : best), 0);
let stopIndex = 0, lastStep = 0;
function step(dir) {
  const now = performance.now();
  if (now - lastStep < 280) return; // um gesto = um passo (ignora a inércia do trackpad)
  lastStep = now;
  const from = travel ? stopIndex : nearestStop(progress());
  stopIndex = Math.max(0, Math.min(STOPS.length - 1, from + dir));
  if (STOPS[stopIndex] !== progress()) travelTo(STOPS[stopIndex]);
}
function goStop(i) { stopIndex = i; lastStep = performance.now(); travelTo(STOPS[i]); }
const free = (e) => locked || !body.classList.contains('is-inside') || (e.target.closest && e.target.closest('.ed, #ledger, input, textarea, select'));
function setupSteps() {
  // Um gesto = uma vista. Trackpads (e a inércia deles) disparam dezenas de eventos
  // por deslize: o gesto só termina depois de um breve silêncio da roda.
  let acc = 0, used = false, quiet;
  addEventListener('wheel', (e) => {
    if (free(e) || e.ctrlKey) return;
    e.preventDefault();
    clearTimeout(quiet);
    quiet = setTimeout(() => { acc = 0; used = false; }, 240);
    if (used) return;
    acc += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (Math.abs(acc) > 30) { used = true; lastStep = 0; step(Math.sign(acc)); }
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (free(e)) return;
    const dir = { ArrowDown: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (dir) { e.preventDefault(); step(dir); }
    else if (e.key === 'Home') { e.preventDefault(); goStop(0); }
    else if (e.key === 'End') { e.preventDefault(); goStop(STOPS.length - 1); }
  });
  let y0 = null;
  addEventListener('touchstart', (e) => { y0 = free(e) ? null : e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => { if (y0 !== null) e.preventDefault(); }, { passive: false });
  addEventListener('touchend', (e) => {
    if (y0 === null) return;
    const dy = y0 - e.changedTouches[0].clientY;
    y0 = null;
    if (Math.abs(dy) > 40) step(Math.sign(dy));
  }, { passive: true });
  // Barra de rolagem arrastada ou outro deslocamento qualquer: assenta na vista mais próxima.
  let idle;
  addEventListener('scroll', () => {
    if (travel) return;
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (travel || locked) return;
      const i = nearestStop(progress());
      if (Math.abs(STOPS[i] - progress()) > 0.002) goStop(i);
      else stopIndex = i;
    }, 220);
  }, { passive: true });
}

// ─── mapa da toca ────────────────────────────────────────────────────────
const burrow = $('.burrow__rooms');
const ink = $('.burrow__ink');
const inkLen = ink.getTotalLength();
ink.style.strokeDasharray = `${inkLen}`;
AREAS.forEach((a, i) => {
  const li = document.createElement('li');
  li.style.top = `${(i / (AREAS.length - 1)) * 100}%`;
  li.innerHTML = `<button type="button"><span>${a.name}</span></button>`;
  li.querySelector('button').addEventListener('click', () => travelTo(a.t + (i ? 0.004 : 0)));
  li.querySelector('button').setAttribute('aria-label', `Ir para ${a.name}`);
  burrow.appendChild(li);
});
const areaItems = [...burrow.children];
function updateBurrow(t) {
  let here = 0;
  AREAS.forEach((a, i) => { if (t >= a.from) here = i; });
  areaItems.forEach((li, i) => { li.classList.toggle('is-here', i === here); li.classList.toggle('is-past', i < here); });
  ink.style.strokeDashoffset = `${inkLen * (1 - Math.min(1, t))}`;
}

// ─── som ─────────────────────────────────────────────────────────────────
const soundBtn = $('.chrome__sound');
function setSound(on) {
  if (on) sound.enable(); else sound.disable();
  soundBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('mathom-sound', on ? '1' : '0'); } catch { /* sem armazenamento */ }
}
soundBtn.addEventListener('click', () => setSound(!sound.enabled));
$('.chrome__mark').addEventListener('click', () => travelTo(0));

// ─── sem WebGL: a casa vira um livro ilustrado ───────────────────────────
async function fallback() {
  window.mathomBooted = true;
  body.classList.remove('is-loading');
  body.classList.add('no-webgl', 'is-inside');
  const { Blocks } = await import('./ui/blocks.js');
  const layer = $('#layer');
  const rooms = {};
  for (const shot of SHOTS) {
    const r = document.createElement('div');
    r.className = 'room';
    r.style.backgroundImage = `url(assets/scenes/${shot.id}.webp)`;
    layer.appendChild(r);
    rooms[shot.id] = r;
  }
  const fake = { state: { scene: '' }, project: () => null };
  const ui = new Blocks(layer, fake, blocks, { contacts, backHome: site.backHome });
  ui.items.forEach((it) => { rooms[it.def.scene].appendChild(it.el); it.el.classList.add('is-in'); });
  document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));
}

// ─── início ──────────────────────────────────────────────────────────────
// Se algo falha no carregamento (quase sempre: arquivos de uma versão antiga no cache
// do navegador), busca tudo de novo uma vez (index.html) — e, se ainda assim falhar,
// mostra a casa como livro ilustrado. Nunca fica parado em "0%".
function recover(err) {
  console.error(err);
  if (window.mathomRefresh && window.mathomRefresh()) return;
  fallback();
}

async function boot() {
  if (!hasWebGL2() || params.has('static') || location.hash === '#texto') return fallback();
  addEventListener('hashchange', () => { if (location.hash === '#texto') location.reload(); });
  // Padrão: o passeio em cenas (fotos quase imóveis, trocas escondidas pelas passagens).
  // Com ?3d, o passeio pelas fotos transformadas em relevo.
  const [{ Engine }, { Blocks }, { Curios }] = await Promise.all([
    params.has('3d') ? import('./engine/engine.js') : import('./engine/cine.js').then((m) => ({ Engine: m.CineEngine })),
    import('./ui/blocks.js'), import('./ui/curios.js'),
  ]);
  const canvas = $('#stage');
  engine = new Engine(canvas, { mobile, reducedMotion });
  const bar = $('.threshold__bar');
  const pct = $('.threshold__pct');
  try {
    await engine.init((p) => {
      bar.style.setProperty('--p', p.toFixed(3));
      pct.textContent = `${Math.round(p * 100)}%`;
    });
  } catch (err) {
    return recover(err);
  }
  window.mathom = engine; // para curiosos no console
  window.mathomBooted = true;
  try { sessionStorage.removeItem('mathom-refresh'); } catch { /* */ }

  const hour = new Date().getHours();
  engine.night = params.has('night') ? 1 : params.has('day') ? 0 : (hour >= 20 || hour < 5 ? 1 : 0);

  blocksUI = new Blocks($('#layer'), engine, blocks, { contacts, backHome: site.backHome });
  curios = new Curios($('#curios'), engine, { mathoms, secrets, hidden, audio: sound, whisper, onLock: lock });
  blocksUI.prepare();
  curios.prepare();
  document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => travelTo(0)));
  addEventListener('resize', () => { engine.resize(); if (engine.flat) blocksUI.prepare(); else blocksUI.measure(); });
  document.fonts && document.fonts.ready.then(() => blocksUI.measure());

  let introStart = 0;
  if (stepped) setupSteps();

  // Editor de posições e textos (só com ?editor na URL).
  if (params.has('editor')) {
    const { Editor } = await import('./ui/editor.js');
    new Editor(engine, blocksUI, { travelTo, progress, mathoms, hidden });
  }

  // Pronto: a porta espera.
  if (params.has('t')) window.scrollTo(0, parseFloat(params.get('t')) * maxScroll());
  engine.state.t = engine.state.target = progress();
  $('#threshold').classList.add('is-ready');
  let prevSound = null;
  try { prevSound = localStorage.getItem('mathom-sound'); } catch { /* */ }
  (prevSound === '0' ? $('[data-enter="silent"]') : $('[data-enter="sound"]')).focus({ preventScroll: true });
  const enter = (withSound) => {
    if (body.classList.contains('is-inside')) return;
    body.classList.remove('is-loading');
    body.classList.add('is-inside');
    if (withSound) setSound(true);
    introStart = performance.now();
    let visits = 0;
    try { visits = +(localStorage.getItem('mathom-visits') || 0); localStorage.setItem('mathom-visits', String(visits + 1)); } catch { /* */ }
    if (engine.night) setTimeout(() => whisper(secrets.night, 5000), 2600);
    else if (visits > 0) setTimeout(() => whisper(secrets.welcomeBack, 4200), 2600);
  };
  $('[data-enter="sound"]').addEventListener('click', () => enter(true));
  $('[data-enter="silent"]').addEventListener('click', () => enter(false));
  if (params.has('enter')) enter(false);

  // Interação com o ambiente: lanternas acendem perto do cursor, o quadro "respira".
  const mouse = { x: 0, y: 0 };
  let paintingSeen = false;
  let lastPick = 0;
  addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
    engine.setMouse(mouse.x, mouse.y);
    const now = performance.now();
    if (now - lastPick < 60 || e.pointerType === 'touch') return;
    lastPick = now;
    lanternHover(e.clientX, e.clientY);
    const scene = engine.state.scene;
    if (!paintingSeen && PAINTINGS[scene]) {
      // o quadro sobre a lareira, projetado na tela (sem raycast: barato a cada movimento)
      const f = engine.world.rooms[scene].frame;
      const [u0, v0, u1, v1] = PAINTINGS[scene];
      const a = engine.project(scene, f.surface(u0, v0), {});
      const b = engine.project(scene, f.surface(u1, v1), {});
      if (a && b && a.front && e.clientX > a.x && e.clientX < b.x && e.clientY > a.y && e.clientY < b.y) {
        paintingSeen = true;
        whisper(secrets.painting);
      }
    }
  }, { passive: true });

  // No toque, a lanterna tocada acende por um instante.
  let touchTimer;
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    lanternHover(e.clientX, e.clientY);
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => { engine.lightBoost = {}; }, 1400);
  }, { passive: true });

  let lanternTold = false;
  function lanternHover(cx, cy) {
    const scene = engine.state.scene;
    const room = engine.world.rooms[scene];
    const boosts = {};
    const lights = room.info.lights || [];
    let hit = false;
    lights.forEach(([u, v], i) => {
      room._lp = room._lp || [];
      room._lp[i] = room._lp[i] || room.frame.surface(u, v, 0.05);
      const pr = engine.project(scene, room._lp[i], {});
      if (!pr || !pr.front) return;
      const d = Math.hypot(pr.x - cx, pr.y - cy);
      if (d < 70) { boosts[i] = 0.9 * (1 - d / 70); hit = true; }
    });
    engine.lightBoost = { [scene]: boosts };
    if (hit && !lanternTold && sound) { lanternTold = true; whisper(secrets.lantern, 2800); }
  }

  // O anel: digite "anel" (ou "ring") em qualquer lugar da casa.
  let typed = '';
  let ringUntil = 0;
  addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    // 1–4: vai direto a um cômodo
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= AREAS.length && !locked) travelTo(AREAS[n - 1].t + (n > 1 ? 0.004 : 0));
    typed = (typed + e.key.toLowerCase()).slice(-6);
    if (typed.endsWith('anel') || typed.endsWith('ring')) {
      ringUntil = performance.now() + 7000;
      whisper(secrets.ring, 5000);
      sound.whoosh(0.8);
    }
  });

  // ─── laço principal ───
  let last = performance.now();
  const areaOf = () => engine.world.rooms[engine.state.scene].area;
  let prevArea = areaOf();
  const hint = $('.scroll-hint');
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepTravel(now);
    const t = progress();
    engine.setProgress(t);
    // revelação inicial: os olhos se acostumam à luz
    if (introStart) engine.intro = Math.min(1, (now - introStart) / 3400);
    const ring = Math.max(0, Math.min(1, (ringUntil - now) / 1200));
    engine.fx.tint.set(1 - ring * 0.25, 1 - ring * 0.12, 1 + ring * 0.05);
    engine.update(dt);
    if (ring > 0) { engine.fx.dof = Math.max(engine.fx.dof, ring * 0.7); engine.fx.focus.set(0.5, 0.5, 0.25); }
    engine.render();
    if (!document.hidden) engine.adapt(dt);
    const st = engine.state;
    blocksUI.update(st.t, engine.mouseSmooth);
    curios.update(st.t);
    updateBurrow(st.t);
    hint.classList.toggle('is-on', st.t < 0.006 && engine.intro > 0.8);
    const area = areaOf();
    if (area !== prevArea) { sound.whoosh(0.7); prevArea = area; }
    sound.update(st.t, area, Math.abs(st.velocity) * 30);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch(recover);
