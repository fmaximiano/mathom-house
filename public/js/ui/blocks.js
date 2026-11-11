// Textos que moram dentro da casa: cada bloco tem um lugar no espaço 3D
// (ou na tela) e um momento do passeio em que aparece.
import * as THREE from '../../vendor/three.module.min.js';

const smooth = (a, b, x) => (b === a ? (x >= b ? 1 : 0) : THREE.MathUtils.smoothstep(x, a, b));

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

export class Blocks {
  constructor(root, engine, blocks, extras = {}) {
    this.root = root;
    this.engine = engine;
    this.extras = extras;
    this.items = blocks.map((b) => this._create(b, extras));
    this.pos = {};
  }

  _create(b, extras) {
    const el = document.createElement(b.kind === 'hero' ? 'header' : 'section');
    el.className = `block block--${b.kind}`;
    el.dataset.align = b.align || 'left';
    el.id = `b-${b.id}`;
    const eyebrow = b.eyebrow ? `<span class="eyebrow">${b.eyebrow}</span>` : '';
    let inner = '';
    switch (b.kind) {
      case 'hero':
        inner = `${eyebrow}<h1 class="split">${split(b.title)}</h1><p class="lede fade-up">${b.text}</p>`;
        break;
      case 'title':
        inner = `${eyebrow}<h2 class="split">${split(b.title)}</h2><p class="fade-up">${b.text}</p>`;
        break;
      case 'line':
        inner = `${eyebrow}<p class="split">${split(b.text)}</p>`;
        break;
      case 'note':
        inner = `${eyebrow}<h3 class="split">${split(b.title)}</h3><p class="fade-up">${b.text}</p>`;
        break;
      case 'whisper':
        inner = `<p class="fade-up">${b.text}</p>`;
        break;
      case 'contact': {
        const links = (extras.contacts || []).filter((c) => c.href)
          .map((c) => `<li><a href="${c.href}" target="_blank" rel="noopener">${c.label}</a></li>`).join('');
        inner = `${eyebrow}<h3 class="split">${split(b.title)}</h3><p class="fade-up">${b.text}</p>${links ? `<ul class="contact-list fade-up">${links}</ul>` : ''}`;
        break;
      }
      case 'finale':
        inner = `${eyebrow}<h2 class="split">${split(b.title)}</h2>
          <button class="home fade-up" type="button" data-home>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><path d="M8 4.5v7M4.5 8h7" stroke="currentColor" opacity=".0"/><path d="M10.5 5.5A3.6 3.6 0 1 0 11.6 8" fill="none" stroke="currentColor"/><path d="M10.5 3.2v2.5H8" fill="none" stroke="currentColor"/></svg>
            ${extras.backHome || 'Voltar'}</button>`;
        break;
      default:
        inner = `<p>${b.text || ''}</p>`;
    }
    el.innerHTML = `<div class="anchor-in">${inner}</div>`;
    this.root.appendChild(el);
    const item = { def: b, el, in: false, o: -1, point: null, k: 1, w: 0, h: 0 };
    return item;
  }

  // Calcula pontos 3D e a escala de referência (quando a leitura acontece).
  prepare() {
    for (const it of this.items) this._place(it);
    this.measure();
  }

  _place(it) {
    const { world } = this.engine;
    const b = it.def;
    if (!b.at) { it.point = null; return; }
    if (this.engine.flat) {
      // passeio em cenas: o texto fica parado na tela, onde o ponto está com a foto em repouso
      it.fixed = this.engine.restScreen(b.scene, b.at[0], b.at[1]);
      it.point = null;
      return;
    }
    it.point = world.rooms[b.scene].frame.surface(b.at[0], b.at[1], b.at[2] || 0);
    // distância de leitura: onde a câmera estará quando o texto estiver inteiro
    const e = this.engine.pathAt(THREE.MathUtils.clamp((b.t[1] + b.t[2]) / 2, 0, 1));
    it.k = Math.max(0.3, world.toWorld(b.scene, it.point).sub(e.p).dot(e.dir));
  }

  // Editor (?editor): troca a definição de um bloco (ou cria um novo) e o redesenha.
  set(def, item = null) {
    const fresh = this._create(def, this.extras);
    if (item) {
      item.el.replaceWith(fresh.el);
      Object.assign(item, { def, el: fresh.el, in: false, o: -1 });
    } else {
      item = fresh;
      this.items.push(item);
    }
    this._place(item);
    item.w = item.el.offsetWidth;
    item.h = item.el.offsetHeight;
    return item;
  }

  remove(item) {
    item.el.remove();
    this.items.splice(this.items.indexOf(item), 1);
  }

  measure() {
    for (const it of this.items) {
      it.w = it.el.offsetWidth;
      it.h = it.el.offsetHeight;
    }
  }

  update(t, mouse) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const g = Math.min(40, Math.max(16, vw * 0.03));
    for (const it of this.items) {
      const b = it.def;
      let o = smooth(b.t[0], b.t[1], t) * (1 - smooth(b.t[2], b.t[3], t));
      if (it.pinned) o = 1; // editor: sempre visível
      o *= Math.min(1, this.engine.areaPresence(b.scene) * 2);
      let x, y, s = 1;
      if (o > 0.001) {
        if (b.at && this.engine.flat) {
          if (!it.fixed) o = 0;
          else { x = it.fixed.x; y = it.fixed.y; }
        } else if (b.at) {
          const pr = this.engine.project(b.scene, it.point, this.pos);
          if (!pr || !pr.front) o = 0;
          else {
            x = pr.x; y = pr.y;
            s = THREE.MathUtils.clamp(it.k / pr.depth, 0.72, 1.7);
          }
        } else {
          x = b.screen[0] * vw + mouse.x * -8;
          y = b.screen[1] * vh + mouse.y * -6;
          s = 1 + (t - Math.max(0, b.t[1])) * 0.8; // aproxima devagar enquanto se lê
        }
      }
      if (o > 0.001) {
        // mantém o texto legível dentro da tela
        const w = it.w * s, h = it.h * s;
        const al = b.align || 'left';
        const left = al === 'left' ? x : al === 'center' ? x - w / 2 : x - w;
        const cl = THREE.MathUtils.clamp(left, g, Math.max(g, vw - w - g));
        x += cl - left;
        y = THREE.MathUtils.clamp(y, g + h / 2 + 30, Math.max(g + h / 2 + 30, vh - h / 2 - g - 40));
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      }
      if (Math.abs(o - it.o) > 0.002) {
        it.el.style.opacity = o.toFixed(3);
        it.o = o;
        it.el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      }
      if (!it.in && o > 0.3) { it.in = true; it.el.classList.add('is-in'); }
      else if (it.in && o < 0.02) { it.in = false; it.el.classList.remove('is-in'); }
      it.el.classList.toggle('is-live', o > 0.6);
    }
  }
}
