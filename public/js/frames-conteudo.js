// Conteúdo do passeio em frames: os textos da casa, os objetos do Mathom (com o livro de registros),
// os segredos, as lanternas e a luneta — com a mesma cara da home (css/style.css). Os textos vêm de
// js/content.js; onde e quando cada um aparece, de js/frames-roteiro.js; os pontos acompanham os
// objetos quadro a quadro (assets/frames/trilhas.json).
import { TEXTOS, OBJETOS } from './frames-roteiro.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  if (b <= a) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const presenca = (q, [a, b, c, d]) => (a < 0 && b < 0 ? 1 : smooth(a, b, q)) * (1 - smooth(c, d, q));
const pad = (n) => String(n).padStart(2, '0');

// Letras que chegam como poeira assentando (como em js/ui/blocks.js).
function split(text) {
  let i = 0;
  return text.split(/(<br\s*\/?>)/).map((part) => {
    if (/^<br/.test(part)) return '<br>';
    return part.split(' ').filter(Boolean).map((w) => {
      const chars = [...w].map((c) => `<span class="c" style="--i:${i++}">${c}</span>`).join('');
      i++;
      return `<span class="w">${chars}</span>`;
    }).join(' ');
  }).join('');
}

export class Conteudo {
  // trilhas: pontos seguidos; conteudo: { blocks, contacts, mathoms, secrets, hidden, site };
  // som; sussurrar(texto, ms); travar(sim); acoes: { inicio(), inspecionar(ponto|null), luneta(sim) }
  constructor(trilhas, conteudo, som, sussurrar, travar, acoes) {
    this.trilhas = trilhas;
    this.c = conteudo;
    this.som = som;
    this.sussurrar = sussurrar;
    this.travar = travar;
    this.acoes = acoes;
    this.vista = null;
    this.q = 0;
    this.f = 0;
    this.atual = null;
    this.lunetaAberta = false;
    this.recuo = 0;                  // com o livro ou a luneta abertos, os textos da casa se recolhem
    this.ledger = document.getElementById('ledger');
    this.scope = document.getElementById('scope');
    try { this.vistos = new Set(JSON.parse(localStorage.getItem('mathom-seen') || '[]')); } catch { this.vistos = new Set(); }
    this.textos = TEXTOS.map((t) => this._texto(t)).filter(Boolean);
    this.objetos = OBJETOS.map((o) => this._objeto(o)).filter(Boolean);
    this._eventos();
  }

  // ─── onde está um ponto seguido, no frame f (fracionário: entre dois frames, a meio caminho) ───
  ponto(id, f) {
    const t = this.trilhas[id];
    if (!t) return null;
    const k = f - t.de;
    if (k < 0 || k > t.pts.length - 1) return null;
    const i = Math.floor(k), a = t.pts[i], b = t.pts[Math.min(t.pts.length - 1, i + 1)];
    if (!a || !b) return a || b;
    const s = k - i;
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
  }

  _naTela(id, f, desvio) {
    const p = this.ponto(id, f);
    if (!p || !this.vista) return null;
    const s = this.vista.tela(p[0], p[1]);
    if (desvio) { s.x += desvio[0] * innerWidth; s.y += desvio[1] * innerHeight; }
    return s;
  }

  // ─── textos ───
  _texto(t) {
    const base = this.c.blocks.find((b) => b.id === t.id);
    if (!base) return null;
    const b = { ...base, ...(t.texto ? { text: t.texto } : {}), align: t.align || base.align || 'left' };
    const el = document.createElement(b.kind === 'hero' ? 'header' : 'section');
    el.className = `block block--${b.kind}`;
    el.dataset.align = b.align;
    const eyebrow = b.eyebrow ? `<span class="eyebrow">${b.eyebrow}</span>` : '';
    let inner;
    switch (b.kind) {
      case 'hero': inner = `${eyebrow}<h1 class="split">${split(b.title)}</h1><p class="lede fade-up">${b.text}</p>`; break;
      case 'title': inner = `${eyebrow}<h2 class="split">${split(b.title)}</h2><p class="fade-up">${b.text}</p>`; break;
      case 'line': inner = `${eyebrow}<p class="split">${split(b.text)}</p>`; break;
      case 'note': inner = `${eyebrow}<h3 class="split">${split(b.title)}</h3><p class="fade-up">${b.text}</p>`; break;
      case 'whisper': inner = `<p class="fade-up">${b.text}</p>`; break;
      case 'contact': {
        const links = (this.c.contacts || []).filter((c) => c.href)
          .map((c) => `<li><a href="${c.href}" target="_blank" rel="noopener">${c.label}</a></li>`).join('');
        inner = `${eyebrow}<h3 class="split">${split(b.title)}</h3><p class="fade-up">${b.text}</p>${links ? `<ul class="contact-list fade-up">${links}</ul>` : ''}`;
        break;
      }
      case 'finale':
        inner = `${eyebrow}<h2 class="split">${split(b.title)}</h2>
          <button class="home fade-up" type="button" data-home>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><path d="M10.5 5.5A3.6 3.6 0 1 0 11.6 8" fill="none" stroke="currentColor"/><path d="M10.5 3.2v2.5H8" fill="none" stroke="currentColor"/></svg>
            ${this.c.site.backHome || 'Voltar'}</button>`;
        break;
      default: inner = `<p>${b.text || ''}</p>`;
    }
    el.innerHTML = `<div class="anchor-in">${inner}</div>`;
    el.style.visibility = 'hidden';
    document.getElementById('layer').appendChild(el);
    el.querySelector('[data-home]')?.addEventListener('click', () => this.acoes.inicio());
    return { t, b, el, o: -1, in: false, w: 0, h: 0 };
  }

  medir() {
    for (const it of this.textos) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
  }

  // ─── objetos ───
  _objeto(o) {
    const { mathoms, secrets, hidden } = this.c;
    let def;
    if (o.mathom) {
      const i = mathoms.findIndex((m) => m.id === o.mathom);
      if (i < 0) return null;
      const m = { ...mathoms[i], ...(o.titulo ? { title: o.titulo } : {}), ...(o.texto ? { text: o.texto } : {}) };
      def = { kind: 'mathom', label: `<i>nº ${pad(i + 1)}</i>${m.kind}<b>${m.title}</b>`, aria: m.title, m, i, clique: () => this.abrir(m, i, it) };
    } else if (o.segredo === 'porta') {
      def = { kind: 'secret', quiet: true, label: '<b>a maçaneta</b>', aria: 'Bater à porta', clique: () => { this.som.knock(); this.sussurrar(secrets.knock); } };
    } else if (o.segredo === 'luneta') {
      def = { kind: 'secret', label: `<b>${secrets.telescopeHint}</b>`, aria: secrets.telescopeHint, clique: () => this.abrirLuneta() };
    } else if (o.segredo) {
      const h = hidden.find((x) => x.label === o.segredo);
      if (!h) return null;
      def = { kind: 'secret', quiet: true, label: `<b>${h.label}</b>`, aria: h.label, clique: () => { this.som.tick(); this.sussurrar(h.text, 4200); } };
    } else if (o.lanterna) {
      const el = document.createElement('div');
      el.className = 'brilho';
      document.getElementById('brilhos').appendChild(el);
      const it = { o, el, lanterna: true, x: 0, y: 0, vis: 0, aceso: 0 };
      return it;
    } else return null;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `curio curio--${def.kind}`;
    el.setAttribute('aria-label', def.aria);
    el.tabIndex = -1;
    el.style.setProperty('--d', `${(Math.random() * 3).toFixed(2)}s`);
    el.innerHTML = `${def.quiet ? '' : '<span class="curio__mote"></span>'}<span class="curio__ring"></span><span class="curio__tag">${def.label}</span>`;
    const it = { o, def, el, op: -1, x: 0, y: 0, perto: (o.q[1] + o.q[2]) / 2 };
    el.addEventListener('click', (e) => { e.stopPropagation(); def.clique(); });
    el.addEventListener('pointerenter', () => {
      this.som.tick && this.som.tick();
      if (o.quadro && !this.quadroVisto) { this.quadroVisto = true; this.sussurrar(this.c.secrets.painting); }
    });
    if (def.m && this.vistos.has(def.m.id)) el.classList.add('is-seen');
    document.getElementById('curios').appendChild(el);
    return it;
  }

  // ─── a cada quadro da tela ───
  // q: a posição no passeio (com o repouso); f: o frame na tela; vista: de ponto do vídeo para a tela
  atualizar(q, f, vista, mouse, dt = 0.016) {
    this.q = q; this.f = f; this.vista = vista;
    this.recuo += ((this.atual || this.lunetaAberta ? 1 : 0) - this.recuo) * Math.min(1, dt * 6);
    const vw = innerWidth, vh = innerHeight;
    const g = Math.min(40, Math.max(16, vw * 0.03));
    for (const it of this.textos) {
      const { t, b } = it;
      let o = presenca(q, t.q) * (1 - this.recuo), x = 0, y = 0, s = 1;
      if (o > 0.001) {
        if (t.em) {
          const p = this._naTela(t.em, f, t.desvio);
          if (!p) o = 0; else { x = p.x; y = p.y; }
        } else {
          x = t.tela[0] * vw + mouse.x * -8;
          y = t.tela[1] * vh + mouse.y * -6;
          s = 1 + clamp(q - Math.max(0, t.q[1]), 0, 40) * 0.0015;   // aproxima devagar enquanto se lê
        }
      }
      if (o > 0.001) {
        // sempre legível, dentro da tela
        const w = it.w * s, h = it.h * s;
        const left = b.align === 'left' ? x : b.align === 'center' ? x - w / 2 : x - w;
        x += clamp(left, g, Math.max(g, vw - w - g)) - left;
        y = clamp(y, g + h / 2 + 30, Math.max(g + h / 2 + 30, vh - h / 2 - g - 40));
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      }
      if (Math.abs(o - it.o) > 0.002) {
        it.el.style.opacity = o.toFixed(3);
        it.el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
        it.o = o;
      }
      if (!it.in && o > 0.3) { it.in = true; it.el.classList.add('is-in'); }
      else if (it.in && o < 0.02) { it.in = false; it.el.classList.remove('is-in'); }
      it.el.classList.toggle('is-live', o > 0.6);
    }

    for (const it of this.objetos) {
      let o = presenca(q, it.o.q);
      if (it.def && (this.atual || this.lunetaAberta)) o *= this.atual && this.atual === it.def.m ? 1 : 0;
      if (it.lanterna && (this.atual || this.lunetaAberta)) o = 0;
      let p = null;
      if (o > 0.001) {
        p = this._naTela(it.o.em, f);
        if (!p || p.x < -30 || p.x > vw + 30 || p.y < -30 || p.y > vh + 30) o = 0;
      }
      if (p) { it.x = p.x; it.y = p.y; }
      if (it.lanterna) {
        it.vis = o;
        const alvo = o * it.aceso;
        if (o > 0.001) it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
        if (Math.abs(alvo - (it.op ?? -1)) > 0.01) { it.el.style.opacity = alvo.toFixed(2); it.op = alvo; }
        continue;
      }
      if (o > 0.001) {
        it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
        it.el.classList.toggle('is-left', it.x > vw * 0.62);
      }
      if (Math.abs(o - it.op) > 0.01) {
        it.el.style.opacity = o.toFixed(2);
        it.el.classList.toggle('is-on', o > 0.5);
        it.el.tabIndex = o > 0.5 ? 0 : -1;
        it.op = o;
      }
      if (it.def.m) it.el.classList.toggle('is-near', o > 0.5 && Math.abs(q - it.perto) < 3 && !this.atual);
    }
  }

  // ─── livro de registros ───
  abrir(m, i, it) {
    this.atual = m;
    const L = this.ledger;
    const again = this.vistos.has(m.id);
    L.querySelector('.ledger__no').textContent = `Livro de mathoms · nº ${pad(i + 1)}${again ? ' · já folheado' : ''}`;
    this.vistos.add(m.id);
    try { localStorage.setItem('mathom-seen', JSON.stringify([...this.vistos])); } catch { /* sem armazenamento */ }
    L.querySelector('.ledger__title').textContent = m.title;
    L.querySelector('.ledger__meta').textContent = [m.kind, m.year].filter((x) => x && x !== '—').join(' · ');
    L.querySelector('.ledger__text').textContent = m.text;
    const actions = L.querySelector('.ledger__actions');
    actions.innerHTML = '';
    if (m.sound === 'lute') {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Tocar uma nota';
      b.addEventListener('click', () => this.som.lute());
      actions.appendChild(b);
      this.som.lute();
    }
    if (m.link) {
      const a = document.createElement('a');
      a.href = m.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Ver de perto →';
      actions.appendChild(a);
    }
    // a página abre do lado oposto ao objeto, para não escondê-lo
    L.classList.toggle('is-left', it.x > innerWidth * 0.5);
    L.classList.add('is-open');
    L.setAttribute('aria-hidden', 'false');
    it.el.classList.add('is-seen');
    this.acoes.inspecionar({ x: it.x, y: it.y });
    this.som.page && this.som.page();
    this.travar(true);
    setTimeout(() => L.querySelector('.ledger__close').focus({ preventScroll: true }), 50);
  }

  fechar() {
    if (!this.atual) return;
    this.atual = null;
    this.ledger.classList.remove('is-open');
    this.ledger.setAttribute('aria-hidden', 'true');
    this.acoes.inspecionar(null);
    this.travar(false);
  }

  abrirLuneta() {
    this.lunetaAberta = true;
    this.scope.classList.add('is-open');
    this.scope.querySelector('.scope__text').textContent = this.c.secrets.telescope;
    this.acoes.luneta(true);
    this.travar(true);
  }

  fecharLuneta() {
    if (!this.lunetaAberta) return;
    this.lunetaAberta = false;
    this.scope.classList.remove('is-open');
    this.acoes.luneta(false);
    this.travar(false);
  }

  // ─── lanternas: acendem perto do cursor (ou do dedo) ───
  _acender(cx, cy) {
    let perto = false;
    for (const it of this.objetos) {
      if (!it.lanterna) continue;
      const d = it.vis > 0.5 ? Math.hypot(it.x - cx, it.y - cy) : Infinity;
      it.aceso = d < 80 ? 1 - (d / 80) * 0.4 : 0;
      if (it.aceso) perto = true;
    }
    if (perto && !this.lanternaDita) { this.lanternaDita = true; this.sussurrar(this.c.secrets.lantern, 2800); }
  }

  _eventos() {
    this.ledger.querySelector('.ledger__close').addEventListener('click', () => this.fechar());
    this.scope.addEventListener('click', () => this.fecharLuneta());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.fechar(); this.fecharLuneta(); } });
    document.addEventListener('pointerdown', (e) => {
      if (this.atual && !this.ledger.contains(e.target) && !e.target.closest('.curio')) this.fechar();
    });
    let ultimo = 0, apagar;
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const agora = performance.now();
      if (agora - ultimo < 50) return;
      ultimo = agora;
      this._acender(e.clientX, e.clientY);
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this._acender(e.clientX, e.clientY);
      clearTimeout(apagar);
      apagar = setTimeout(() => { for (const it of this.objetos) if (it.lanterna) it.aceso = 0; }, 1400);
    }, { passive: true });
  }
}
