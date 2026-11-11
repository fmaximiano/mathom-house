// Coisas exploráveis: os objetos do Mathom (com o livro de registros),
// a maçaneta da porta, a janela redonda do World-rim.
import * as THREE from '../../vendor/three.module.min.js';
import { SHOTS } from '../journey.js';

const pad = (n) => String(n).padStart(2, '0');

export class Curios {
  constructor(root, engine, { mathoms, secrets, hidden = [], audio, whisper, onLock }) {
    this.root = root;
    this.engine = engine;
    this.audio = audio;
    this.whisper = whisper;
    this.onLock = onLock;
    this.secrets = secrets;
    this.items = [];
    this.pos = {};
    this.ledger = document.getElementById('ledger');
    this.scope = document.getElementById('scope');
    this.scopeOpen = false;
    try { this.seen = new Set(JSON.parse(localStorage.getItem('mathom-seen') || '[]')); } catch { this.seen = new Set(); }

    // cada objeto aparece enquanto a câmera está perto da vista em que ele está
    const around = (scene) => {
      const t = SHOTS.find((x) => x.id === scene).t;
      return [t - 0.035, t - 0.014, t + 0.025, t + 0.045];
    };
    mathoms.forEach((m, i) => this._add({
      kind: 'mathom', scene: m.scene, at: m.at, lift: 0.12, t: around(m.scene), near: around(m.scene)[1] + 0.014,
      label: `<i>nº ${pad(i + 1)}</i>${m.kind}<b>${m.title}</b>`, aria: m.title,
      onClick: () => this.open(m, i),
      data: m,
    }));
    this._add({
      kind: 'secret', scene: 's01', at: [0.381, 0.462], lift: 0.05, t: [0.0, 0.0, 0.03, 0.05],
      label: '<b>a maçaneta</b>', aria: 'Bater à porta', quiet: true,
      onClick: () => { this.audio.knock(); this.whisper(secrets.knock); },
    });
    this._add({
      kind: 'secret', scene: 's10', at: [0.635, 0.27], lift: 0.1, t: [0.87, 0.885, 0.915, 0.93],
      label: `<b>${secrets.telescopeHint}</b>`, aria: secrets.telescopeHint,
      onClick: () => this.openScope(),
    });

    hidden.forEach((h) => this._add({
      kind: 'secret', scene: h.scene, at: h.at, lift: 0.08, t: h.t, quiet: true,
      label: `<b>${h.label}</b>`, aria: h.label,
      onClick: () => { this.audio.tick(); this.whisper(h.text, 4200); },
    }));

    this.ledger.querySelector('.ledger__close').addEventListener('click', () => this.close());
    this.scope.addEventListener('click', () => this.closeScope());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.close(); this.closeScope(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.current && !this.ledger.contains(e.target) && !e.target.closest('.curio')) this.close();
    });
  }

  _add(def) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `curio curio--${def.kind}`;
    el.setAttribute('aria-label', def.aria);
    el.style.setProperty('--d', `${(Math.random() * 3).toFixed(2)}s`);
    el.innerHTML = `${def.quiet ? '' : '<span class="curio__mote"></span>'}<span class="curio__ring"></span><span class="curio__tag">${def.label}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); def.onClick(); });
    el.addEventListener('pointerenter', () => this.audio.tick && this.audio.tick());
    if (def.data && this.seen.has(def.data.id)) el.classList.add('is-seen');
    this.root.appendChild(el);
    this.items.push({ def, el, point: null, o: -1 });
  }

  prepare() {
    for (const it of this.items) {
      const room = this.engine.world.rooms[it.def.scene];
      it.point = room ? room.frame.surface(it.def.at[0], it.def.at[1], it.def.lift) : null;
    }
  }

  update(t) {
    const vw = window.innerWidth;
    for (const it of this.items) {
      const d = it.def;
      let o = THREE.MathUtils.smoothstep(t, d.t[0], d.t[1] || d.t[0] + 1e-4) * (1 - THREE.MathUtils.smoothstep(t, d.t[2], d.t[3]));
      if (d.t[0] === 0 && d.t[1] === 0) o = 1 - THREE.MathUtils.smoothstep(t, d.t[2], d.t[3]);
      o *= Math.min(1, this.engine.areaPresence(d.scene) * 2);
      if (this.current || this.scopeOpen) o *= this.current && this.current.id === d.data?.id ? 1 : 0;
      let x = 0, y = 0;
      if (o > 0.001 && !it.point) o = 0;
      if (o > 0.001) {
        const pr = this.engine.project(d.scene, it.point, this.pos);
        if (!pr || !pr.front) o = 0;
        else { x = pr.x; y = pr.y; }
        if (x < -40 || x > vw + 40) o = 0;
      }
      if (o > 0.001) {
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        it.el.classList.toggle('is-left', x > vw * 0.62);
      }
      if (Math.abs(o - it.o) > 0.01) {
        it.el.style.opacity = o.toFixed(2);
        it.el.classList.toggle('is-on', o > 0.5);
        it.el.tabIndex = o > 0.5 ? 0 : -1;
        it.o = o;
      }
      if (d.near !== undefined) it.el.classList.toggle('is-near', Math.abs(t - d.near) < 0.006 && !this.current);
    }
  }

  open(m, i) {
    this.current = m;
    const L = this.ledger;
    const again = this.seen.has(m.id);
    L.querySelector('.ledger__no').textContent = `Livro de mathoms · nº ${pad(i + 1)}${again ? ' · já folheado' : ''}`;
    this.seen.add(m.id);
    try { localStorage.setItem('mathom-seen', JSON.stringify([...this.seen])); } catch { /* sem armazenamento */ }
    L.querySelector('.ledger__title').textContent = m.title;
    L.querySelector('.ledger__meta').textContent = [m.kind, m.year].filter((x) => x && x !== '—').join(' · ');
    L.querySelector('.ledger__text').textContent = m.text;
    const actions = L.querySelector('.ledger__actions');
    actions.innerHTML = '';
    if (m.sound === 'lute') {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Tocar uma nota';
      b.addEventListener('click', () => this.audio.lute(true));
      actions.appendChild(b);
      this.audio.lute(true);
    }
    if (m.link) {
      const a = document.createElement('a');
      a.href = m.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ver de perto →';
      actions.appendChild(a);
    }
    // a página abre do lado oposto ao objeto, para não escondê-lo
    const it = this.items.find((x) => x.def.data === m);
    const pr = this.engine.project(it.def.scene, it.point, {});
    L.classList.toggle('is-left', !!pr && pr.x > window.innerWidth * 0.5);
    L.classList.add('is-open');
    L.setAttribute('aria-hidden', 'false');
    it.el.classList.add('is-seen');
    this.engine.inspect = { scene: it.def.scene, point: it.point, radius: 0.09 };
    this.audio.page && this.audio.page();
    this.onLock(true);
    setTimeout(() => L.querySelector('.ledger__close').focus({ preventScroll: true }), 50);
  }

  close() {
    if (!this.current) return;
    this.current = null;
    this.ledger.classList.remove('is-open');
    this.ledger.setAttribute('aria-hidden', 'true');
    this.engine.inspect = null;
    this.onLock(false);
  }

  openScope() {
    // ao longe, pela janela redonda: o sol baixo sobre as colinas
    const { world } = this.engine;
    const f = world.rooms.s10.frame;
    this.engine.scope = { point: world.toWorld('s10', f.point(0.72, 0.33, f.zf * 3)), fov: 14 };
    this.scopeOpen = true;
    this.scope.classList.add('is-open');
    this.scope.querySelector('.scope__text').textContent = this.secrets.telescope;
    this.audio.whoosh && this.audio.whoosh(0.5);
    this.onLock(true);
  }

  closeScope() {
    if (!this.scopeOpen) return;
    this.scopeOpen = false;
    this.engine.scope = null;
    this.scope.classList.remove('is-open');
    this.onLock(false);
  }
}
