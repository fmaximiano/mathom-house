// Passeio em cenas: cada foto fica quase imóvel e se amplia devagar, sempre no mesmo
// sentido, até coincidir com o quadro da foto seguinte — e a troca acontece nesse instante,
// escondida pela porta ou pelo arco quando há um (a foto nova aparece primeiro pela abertura).
// Nada de relevo 3D nem de bordas esticadas: a imagem nunca sai do próprio quadro.
//
// A rolagem é a linha do tempo: cada posição da página corresponde sempre ao mesmo quadro,
// indo ou voltando. O plano (qual foto, em que enquadramento) vem de tools/cine_plan.py.
//
// Coordenadas de imagem: x de 0 a ASPECT (largura/altura), y de 0 a 1, de cima para baixo.
// Enquadramento (view): { x, y } = centro, h = meia altura visível.
import * as THREE from '../../vendor/three.module.min.js';
import { Post } from './post.js';
import { Tracks } from './path.js';
import { sceneVert, cineFrag } from './shaders.js';
import { direction } from '../journey.js';

const ASSETS = 'assets/scenes/';
const MARGIN = 0.006;          // margem de segurança dentro de cada foto
const FADE = 0.03;             // meia largura padrão da troca, em ampliação (±3%); cine.json pode mudar por par
const SETTLE = 1.05;           // quanto cada foto ainda se aproxima depois de entrar
const MIN_PUSH = 1.035;        // ampliação mínima de uma foto antes de ceder a vez
const ease = (u) => u * u * (3 - 2 * u);   // parte e chega em repouso
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

function loadTexture(loader, url, color = true) {
  return new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, () => reject(new Error(`falha ao carregar ${url}`)));
  });
}

// Uma "moldura" plana com a mesma interface usada pelos textos, objetos e pelo editor:
// pontos são simplesmente (u, v) da imagem.
const flatFrame = {
  zn: 1, zf: 1,
  surface: (u, v, dz = 0, out = new THREE.Vector3()) => out.set(u, v, 0),
  point: (u, v, z, out = new THREE.Vector3()) => out.set(u, v, 0),
  project: (p) => ({ u: p.x, v: p.y, z: 1 }),
  depthAt: () => 1,
};

// Zoom em torno do ponto que fica parado entre dois enquadramentos (nada "desliza").
function zoomPath(v0, v1, f, out) {
  out.h = v0.h * Math.pow(v1.h / v0.h, f);
  if (Math.abs(v0.h - v1.h) < 1e-6) {
    out.x = v0.x + (v1.x - v0.x) * f;
    out.y = v0.y + (v1.y - v0.y) * f;
  } else {
    const px = (v1.x * v0.h - v0.x * v1.h) / (v0.h - v1.h);
    const py = (v1.y * v0.h - v0.y * v1.h) / (v0.h - v1.h);
    out.x = px + (v0.x - px) * out.h / v0.h;
    out.y = py + (v0.y - py) * out.h / v0.h;
  }
  return out;
}

export class CineEngine {
  constructor(canvas, opts = {}) {
    this.flat = true;
    this.opts = opts;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x0a0705, 0);   // alfa 0 = fora da foto
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.post = new Post(this.renderer);
    this.post.samples = 0;
    this.camA = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
    this.camB = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
    this.state = { t: 0, target: 0, scene: '', a: '', b: '', mix: 0, velocity: 0 };
    this.cur = { a: null, b: null, viewA: { x: 0, y: 0, h: 0.5 }, viewB: { x: 0, y: 0, h: 0.5 }, gate: 0, fade: 0, pair: null, depth: 0 };
    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.time = 0;
    this.renderScale = 1;
    this.inspect = null;
    this.inspectAmt = 0;
    this.night = 0;
    this.scope = null;
    this.scopeAmt = 0;
    this.motion = 0;
    this.intro = 0;
    this.lightBoost = {};
    this._frameTimes = [];
    this.fx = {
      foe: new THREE.Vector2(0.5, 0.5), focus: new THREE.Vector3(0.5, 0.5, 0.3), dof: 0,
      fade: new THREE.Vector4(0.03, 0.02, 0.015, 1), tint: new THREE.Vector3(1, 1, 1),
    };
  }

  async init(onProgress) {
    const mobile = !!this.opts.mobile;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hd = !mobile && Math.max(window.innerWidth, window.innerHeight) * dpr > 1900;
    const [manifest, plan] = await Promise.all([
      fetch(ASSETS + 'manifest.json').then((r) => r.json()),
      fetch(ASSETS + 'cine.json').then((r) => r.json()),
    ]);
    this.aspect0 = plan.aspect;
    this.seq = plan.sequence;
    this.pairs = plan.pairs;
    const gated = new Set(plan.pairs.filter((p) => p.gate).map((p) => p.a));
    const loader = new THREE.TextureLoader();
    let done = 0;
    const total = this.seq.length * 2 + gated.size;
    const tick = (x) => { done++; onProgress(done / total); return x; };
    const suffix = hd ? '@2x' : '';
    const loaded = await Promise.all(this.seq.map(async (name) => {
      const [color, fx, gate] = await Promise.all([
        loadTexture(loader, `${ASSETS}${name}${suffix}.webp`)
          .catch(() => loadTexture(loader, `${ASSETS}${name}.webp`)).then(tick),
        loadTexture(loader, `${ASSETS}${name}.fx.webp`, false).then(tick),
        gated.has(name) ? loadTexture(loader, `${ASSETS}${name}.gate.webp`, false).then(tick) : null,
      ]);
      return { name, color, fx, gate };
    }));

    const shots = Object.fromEntries(direction.shots.map((s) => [s.id, s]));
    const rooms = {};
    const plane = new THREE.PlaneGeometry(this.aspect0, 1);
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    for (const { name, color, fx, gate } of loaded) {
      const info = manifest.views[name] || {};
      const shot = shots[name] || {};
      const area = direction.areas[shot.area] || {};
      const lights = (info.lights || []).map(([x, y, r]) => new THREE.Vector4(x, 1 - y, r, 0));
      while (lights.length < 28) lights.push(new THREE.Vector4(0, 0, 0, 0));
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: sceneVert, fragmentShader: cineFrag,
        blending: THREE.NoBlending, depthTest: false, depthWrite: false,
        uniforms: {
          map: { value: color }, fxMap: { value: fx }, gateMap: { value: gate || blank }, uGateOn: { value: 0 },
          uTime: { value: 0 }, uExposure: { value: 1 }, uSway: { value: area.sway ?? 1 },
          uAspect: { value: this.aspect0 },
          uLights: { value: lights }, uLightCount: { value: Math.min(28, (info.lights || []).length) },
          uFire: { value: info.fire ? new THREE.Vector4(info.fire[0], 1 - info.fire[1], info.fire[2], 1) : new THREE.Vector4(0, 0, 0, 0) },
          uGrade: { value: new THREE.Vector3(1, 1, 1) }, uNight: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(plane, mat);
      mesh.position.set(this.aspect0 / 2, -0.5, 0);
      mesh.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(mesh);
      rooms[name] = { name, area: shot.area, frame: flatFrame, scene, mesh, mat, info, cfg: { ...area, ...shot }, lights, look: shot.look };
    }
    const id = (name, p) => p.clone();
    this.world = { rooms, manifest, toWorld: id, toLocal: id, convert: (p) => p.clone(), update: () => {} };
    this.tracks = new Tracks(direction.tracks);
    this.focusDefs = direction.focus(this.world);
    this._times();
    this.resize();
    for (const room of Object.values(rooms)) {
      this.renderer.compile(room.scene, this.camA);
      this.renderer.initTexture(room.mat.uniforms.map.value);
      this.renderer.initTexture(room.mat.uniforms.fxMap.value);
    }
    this.update(0);
    return this;
  }

  // Momento de cada foto no passeio: as principais têm o seu `t` (journey.js); as
  // intermediárias ficam entre elas, na proporção da ampliação de cada passo.
  _times() {
    const shots = Object.fromEntries(direction.shots.map((s) => [s.id, s]));
    const fixed = (n) => shots[n] && !shots[n].via && shots[n].t !== undefined;
    const t = this.seq.map((n) => (fixed(n) ? shots[n].t : null));
    const step = this.pairs.map((p) => Math.log(1 / Math.min(0.97, p.s)));
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== null) continue;
      let a = i - 1, b = i + 1;
      while (t[a] === null) a--;
      while (t[b] === null) b++;
      let tot = 0, upto = 0;
      for (let k = a; k < b; k++) { tot += step[k]; if (k < i) upto += step[k]; }
      t[i] = t[a] + (t[b] - t[a]) * upto / tot;
    }
    this.times = t;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const maxDpr = this.opts.mobile ? 1.5 : 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.post.setSize(Math.round(w * dpr), Math.round(h * dpr));
    this.dpr = dpr;
    const av = w / h;
    if (av !== this.av && this.seq) { this.av = av; this._plan(); }
    this.av = av;
  }

  // ─── plano: enquadramentos de repouso, de saída e de entrada de cada foto ───
  _range(h, s = 1, t = [0, 0]) {
    // centros possíveis (em coordenadas da foto B) para que o quadro caiba em B e,
    // levado por (s, t), também caiba em A
    const av = this.av, A = this.aspect0, m = MARGIN;
    const hw = h * av;
    const x0 = Math.max(hw + m, (s * hw + m - t[0]) / s), x1 = Math.min(A - hw - m, (A - s * hw - m - t[0]) / s);
    const y0 = Math.max(h + m, (s * h + m - t[1]) / s), y1 = Math.min(1 - h - m, (1 - s * h - m - t[1]) / s);
    return x0 <= x1 && y0 <= y1 ? [x0, x1, y0, y1] : null;
  }

  _pref(name) {
    const look = this.world.rooms[name].look;
    return { x: (this.av < 1 && look ? look[0] : 0.5) * this.aspect0, y: 0.5 };
  }

  _fit(name, h, s, t, pref = this._pref(name)) {
    for (let k = 0; k < 400; k++, h *= 0.99) {
      const r = this._range(h, s, t);
      if (r) return { x: THREE.MathUtils.clamp(pref.x, r[0], r[1]), y: THREE.MathUtils.clamp(pref.y, r[2], r[3]), h };
    }
    return { x: this.aspect0 / 2, y: 0.5, h: h };
  }

  _plan() {
    const hMax = Math.min(0.5 - MARGIN, (this.aspect0 / 2 - MARGIN) / this.av);
    const n = this.seq.length;
    const rest = [this._fit(this.seq[0], hMax, 1, [0, 0])];
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const p = this.pairs[i], A = rest[i];
      const entry = this._fit(p.b, Math.min(hMax, A.h / (MIN_PUSH * p.s)), p.s, p.t);
      const exit = { x: p.s * entry.x + p.t[0], y: p.s * entry.y + p.t[1], h: p.s * entry.h };
      const pref = this._pref(p.b);
      const rh = entry.h / SETTLE;
      const r = this._range(rh) || [entry.x, entry.x, entry.y, entry.y];
      const rb = {
        x: THREE.MathUtils.clamp((entry.x + pref.x) / 2, r[0], r[1]),
        y: THREE.MathUtils.clamp((entry.y + pref.y) / 2, r[2], r[3]), h: rh,
      };
      rest.push(rb);
      segs.push({ pair: p, t0: this.times[i], t1: this.times[i + 1], rest: A, exit, entry, restB: rb,
        dA: Math.log(A.h / exit.h), dB: Math.log(entry.h / rb.h) });
    }
    // fim: a última foto se aproxima da janela redonda
    const last = rest[n - 1];
    const win = { x: 0.635 * this.aspect0, y: 0.3 };
    const eh = last.h / 1.22;
    const er = this._range(eh) || [last.x, last.x, last.y, last.y];
    const end = { x: THREE.MathUtils.clamp(win.x, er[0], er[1]), y: THREE.MathUtils.clamp(win.y, er[2], er[3]), h: eh };
    segs.push({ pair: null, a: this.seq[n - 1], t0: this.times[n - 1], t1: 1, rest: last, exit: end, dA: Math.log(last.h / end.h), dB: 0 });
    let acc = 0;
    for (const s of segs) { s.depth0 = acc; acc += s.dA + s.dB; }
    this.rests = Object.fromEntries(this.seq.map((name, i) => [name, rest[i]]));
    this.segs = segs;
  }

  // Estado visual num momento do passeio (sempre o mesmo para o mesmo t).
  _eval(t, out) {
    const S = this.segs;
    let k = 0;
    while (k + 1 < S.length && S[k + 1].t0 <= t) k++;
    const g = S[k];
    const u = THREE.MathUtils.clamp((t - g.t0) / Math.max(1e-6, g.t1 - g.t0), 0, 1);
    const d = ease(u) * (g.dA + g.dB);
    out.depth = g.depth0 + d;
    out.seg = g;
    if (!g.pair) {
      out.a = out.b = g.a; out.pair = null; out.gate = out.fade = 0;
      zoomPath(g.rest, g.exit, g.dA > 0 ? d / g.dA : 0, out.viewA);
      out.fixed = null;
      return out;
    }
    const p = g.pair;
    out.pair = p; out.a = p.a; out.b = p.b;
    if (d <= g.dA) {
      zoomPath(g.rest, g.exit, g.dA > 0 ? d / g.dA : 1, out.viewA);
      out.viewB.x = (out.viewA.x - p.t[0]) / p.s; out.viewB.y = (out.viewA.y - p.t[1]) / p.s; out.viewB.h = out.viewA.h / p.s;
    } else {
      zoomPath(g.entry, g.restB, g.dB > 0 ? (d - g.dA) / g.dB : 1, out.viewB);
      out.viewA.x = p.s * out.viewB.x + p.t[0]; out.viewA.y = p.s * out.viewB.y + p.t[1]; out.viewA.h = p.s * out.viewB.h;
    }
    const w = p.fade ?? FADE;
    out.fade = smooth(g.dA - w, g.dA + w, d);
    out.gate = p.gate ? smooth(g.dA * 0.35, g.dA - w, d) : 0;
    return out;
  }

  setProgress(t) { this.state.target = THREE.MathUtils.clamp(t, 0, 1); }
  setMouse(x, y) { this.mouse.set(x, y); }

  presence(scene) {
    const st = this.state;
    if (scene === st.a && scene === st.b) return 1;
    if (scene === st.a) return 1 - st.mix;
    if (scene === st.b) return st.mix;
    return 0;
  }

  areaPresence(scene) {
    const st = this.state, R = this.world.rooms;
    if (!R[scene]) return 0;
    const area = R[scene].area;
    return (R[st.a].area === area ? 1 - st.mix : 0) + (R[st.b].area === area ? st.mix : 0);
  }

  _viewOf(scene) {
    const c = this.cur;
    if (scene === c.a) return c.viewA;
    if (scene === c.b && (c.fade > 0.001 || c.gate > 0.001)) return c.viewB;
    return null;
  }

  _toScreen(view, u, v, out) {
    out.x = ((u * this.aspect0 - view.x) / (view.h * this.av) * 0.5 + 0.5) * window.innerWidth;
    out.y = ((v - view.y) / view.h * 0.5 + 0.5) * window.innerHeight;
    out.depth = 1; out.front = true;
    return out;
  }

  // Ponto (u, v) de uma foto -> tela. null se a foto não está em cena.
  project(scene, point, out = {}) {
    const view = this._viewOf(scene);
    return view ? this._toScreen(view, point.x, point.y, out) : null;
  }

  // Onde um ponto de uma foto fica quando ela está em repouso (camada estável dos textos).
  restScreen(scene, u, v) {
    const view = this.rests && this.rests[scene];
    return view ? this._toScreen(view, u, v, {}) : null;
  }

  pick(clientX, clientY) {
    const scene = this.state.scene, view = this._viewOf(scene);
    if (!view) return null;
    const u = (view.x + (clientX / window.innerWidth - 0.5) * 2 * view.h * this.av) / this.aspect0;
    const v = view.y + (clientY / window.innerHeight - 0.5) * 2 * view.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { scene, point: new THREE.Vector3(u, v, 0), uv: { u, v } };
  }

  _clampView(v) {
    const r = this._range(v.h);
    if (!r) return v;
    v.x = THREE.MathUtils.clamp(v.x, r[0], r[1]);
    v.y = THREE.MathUtils.clamp(v.y, r[2], r[3]);
    return v;
  }

  _camera(cam, v) {
    const hw = v.h * this.av;
    cam.left = v.x - hw; cam.right = v.x + hw;
    cam.top = -(v.y - v.h); cam.bottom = -(v.y + v.h);
    cam.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    const st = this.state, c = this.cur;
    // a rolagem é a linha do tempo: sem inércia, o mesmo quadro para a mesma posição
    const prevT = st.t;
    st.t = st.target;
    st.velocity = (st.t - prevT) / Math.max(dt, 1e-3);
    const prevDepth = c.depth;
    this._eval(st.t, c);
    st.a = c.a; st.b = c.b; st.mix = c.fade;
    st.scene = c.fade < 0.5 ? c.a : c.b;

    // o mouse desloca o quadro de leve (sem sair da foto); a mesma fração nas duas fotos
    const pk = 1 - Math.exp(-dt * 2.5);
    this.mouseSmooth.lerp(this.mouse, pk);
    const k = this.opts.reducedMotion ? 0.3 : 1;
    const ox = this.mouseSmooth.x * 0.014 * k, oy = this.mouseSmooth.y * 0.009 * k;
    for (const v of [c.viewA, c.viewB]) { v.x += ox * v.h * this.av; v.y += oy * v.h; }

    // olhar ao longe (a janela redonda): a lente se fecha sobre o ponto
    this.scopeAmt = THREE.MathUtils.lerp(this.scopeAmt, this.scope ? 1 : 0, 1 - Math.exp(-dt * 2.6));
    if (this.scope) this._scope = this.scope;
    if (this._scope && this.scopeAmt > 0.001) {
      const z = 1 + 1.5 * THREE.MathUtils.smoothstep(this.scopeAmt, 0, 1);
      const px = this._scope.point.x * this.aspect0, py = this._scope.point.y;
      const v = c.viewA;
      v.h /= z; v.x = px + (v.x - px) / z; v.y = py + (v.y - py) / z;
    }
    this._clampView(c.viewA);
    this._clampView(c.viewB);
    this._camera(this.camA, c.viewA);
    this._camera(this.camB, c.viewB);

    // velocidade da aproximação -> desfoque radial, a partir do ponto que fica parado
    const speed = dt > 0 ? Math.abs(c.depth - prevDepth) / dt : 0;
    const motionGain = (this.tracks.get('motionGain', st.t) ?? 1) * (this.opts.reducedMotion ? 0 : 1);
    this.motion = THREE.MathUtils.lerp(this.motion, THREE.MathUtils.clamp(speed * 0.02, 0, 0.05) * motionGain, 1 - Math.exp(-dt * 10));
    const g = c.seg, v0 = g.rest, v1 = g.exit;
    if (Math.abs(v0.h - v1.h) > 1e-6) {
      const fp = this._toScreen(c.viewA, ((v1.x * v0.h - v0.x * v1.h) / (v0.h - v1.h)) / this.aspect0, (v1.y * v0.h - v0.y * v1.h) / (v0.h - v1.h), {});
      this.fx.foe.set(THREE.MathUtils.clamp(fp.x / window.innerWidth, 0.2, 0.8), THREE.MathUtils.clamp(1 - fp.y / window.innerHeight, 0.2, 0.8));
    }

    // foco de lente (trilhas + objeto em destaque)
    let dof = 0;
    for (const f of this.focusDefs) {
      if (st.t < f.from || st.t > f.to) continue;
      const w = st.t < f.peak[0] ? smooth(f.from, f.peak[0], st.t) : 1 - smooth(f.peak[1], f.to, st.t);
      const pr = this.project(f.scene, f.point, {});
      if (pr) { this.fx.focus.set(pr.x / window.innerWidth, 1 - pr.y / window.innerHeight, f.radius); dof = Math.max(dof, w * f.amount); }
    }
    this.inspectAmt = THREE.MathUtils.lerp(this.inspectAmt, this.inspect ? 1 : 0, 1 - Math.exp(-dt * 4));
    if (this.inspect) {
      const pr = this.project(this.inspect.scene, this.inspect.point, {});
      if (pr) this._inspectFocus = [pr.x / window.innerWidth, 1 - pr.y / window.innerHeight, this.inspect.radius || 0.12];
    }
    if (this._inspectFocus && this.inspectAmt > 0.01) {
      const [fx, fy, fr] = this._inspectFocus, a = this.inspectAmt;
      this.fx.focus.set(THREE.MathUtils.lerp(this.fx.focus.x, fx, a), THREE.MathUtils.lerp(this.fx.focus.y, fy, a), THREE.MathUtils.lerp(this.fx.focus.z, fr, a));
      dof = Math.max(dof, a * 0.95);
    }
    this.fx.dof = dof;

    for (const r of Object.values(this.world.rooms)) {
      const boosts = this.lightBoost[r.name] || {};
      r.lights.forEach((L, i) => { L.w = THREE.MathUtils.lerp(L.w, boosts[i] || 0, 1 - Math.exp(-dt * 6)); });
      r.mat.uniforms.uNight.value = this.night * (r.cfg.night ?? 0.4);
      r.mat.uniforms.uTime.value = this.time;
    }
  }

  render() {
    const r = this.renderer, st = this.state, c = this.cur;
    const A = this.world.rooms[c.a], B = this.world.rooms[c.b];
    const both = A !== B && (c.fade > 0.001 || c.gate > 0.001);
    A.mat.uniforms.uGateOn.value = both && c.pair && c.pair.gate ? 1 : 0;
    r.setRenderTarget(this.post.sceneRT);
    r.clear(true, true, true);
    r.render(A.scene, this.camA);
    let source = this.post.sceneRT;
    if (both) {
      if (c.fade > 0.999) {
        r.clear(true, true, true);
        B.mat.uniforms.uGateOn.value = 0;
        r.render(B.scene, this.camB);
      } else {
        B.mat.uniforms.uGateOn.value = 0;
        r.setRenderTarget(this.post.layerRT);
        r.clear(true, true, true);
        r.render(B.scene, this.camB);
        source = this.post.cineBlend(c.gate, c.fade);
      }
    }

    const t = st.t;
    const ii = THREE.MathUtils.smoothstep(this.intro, 0, 1);
    this.fx.fade.w = Math.pow(1 - ii, 3) * 0.85;
    const sat = this.tracks.get('saturation', t) ?? 1;
    const tunnel = (this.tracks.get('tunnel', t) ?? 0) * (this.opts.reducedMotion ? 0.5 : 1) * 0.6;
    this._vigC = this._vigC || new THREE.Vector2(0.5, 0.5);
    this._vigC.set(0.5 + (this.fx.foe.x - 0.5) * tunnel * 0.8, 0.5 + (this.fx.foe.y - 0.5) * tunnel * 0.8);
    this.post.render({
      source,
      vigScale: 1 + tunnel * 1.25,
      vigCenter: this._vigC,
      time: this.time,
      bloom: (this.tracks.get('bloom', t) ?? 0.5) * (1 + this.night * 0.6) * (1 + (1 - ii) * 2.5),
      bloomThreshold: 0.75 - this.night * 0.25,
      exposure: (this.tracks.get('exposure', t) ?? 1) * (1 - this.inspectAmt * 0.12) * (0.25 + 0.75 * ii),
      vignette: Math.min(0.97, (this.tracks.get('vignette', t) ?? 0.38) + this.inspectAmt * 0.15 + (1 - ii) * 0.4 + tunnel * 0.5),
      grain: 0.05,
      motion: this.motion,
      foe: this.fx.foe,
      focus: this.fx.focus,
      dof: this.fx.dof,
      fade: this.fx.fade,
      saturation: sat * (1 - this.inspectAmt * 0.12),
      tint: this.fx.tint,
    });
  }

  adapt(dt) {
    const ft = this._frameTimes;
    ft.push(dt);
    if (ft.length < 90) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    if (avg > 1 / 40 && this.renderScale > 0.6) { this.renderScale = Math.max(0.6, this.renderScale - 0.12); this.resize(); }
    else if (avg < 1 / 58 && this.renderScale < 1) { this.renderScale = Math.min(1, this.renderScale + 0.06); this.resize(); }
  }
}
