// O motor: carrega a casa, move a câmera conforme a rolagem e desenha cada quadro.
import * as THREE from '../../vendor/three.module.min.js';
import { World } from './world.js';
import { ShotPath, Tracks, fillTimes } from './path.js';
import { Post } from './post.js';
import { direction } from '../journey.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Engine {
  constructor(canvas, opts = {}) {
    this.opts = opts;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    // alfa 0 no fundo: "nenhuma informação" para a fusão das vistas
    this.renderer.setClearColor(0x0a0705, 0);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.post = new Post(this.renderer);
    this.post.samples = opts.mobile ? 0 : 4;
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
    this.state = { t: 0, target: 0, scene: '', a: '', b: '', mix: 0, velocity: 0 };
    this.eval = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.evalPrev = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.time = 0;
    this.renderScale = 1;
    this.inspect = null;       // foco externo (ex.: objeto do Mathom em destaque)
    this.inspectAmt = 0;
    this.night = 0;
    this.scope = null;         // olhar ao longe: { point (mundo), fov }
    this.scopeAmt = 0;
    this.motion = 0;
    this.coverK = 1;
    this.intro = 0;            // 0..1 revelação inicial
    this.lightBoost = {};      // { vista: { índice: valor } } — interação com lanternas
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
    this.world = await new World(this.renderer, direction).load({ hd, mobile, onProgress });
    this.fov = this.world.manifest.fov;
    fillTimes(direction.shots, this.world);
    this.pathWide = new ShotPath(direction.shots, direction.extraKeys(this.world), this.world, false);
    // Em telas em pé, cada vista mira no seu ponto de interesse (look).
    this.pathTall = new ShotPath(direction.shots, direction.extraKeys(this.world), this.world, true);
    this.path = this.pathWide;
    this.tracks = new Tracks(direction.tracks);
    this.focusDefs = direction.focus(this.world);
    this.resize();
    // Compila os shaders e envia as texturas antes de mostrar (sem engasgos no caminho).
    for (const room of Object.values(this.world.rooms)) {
      this.renderer.compile(room.scene, this.cam);
      this.renderer.initTexture(room.mat.uniforms.map.value);
      this.renderer.initTexture(room.mat.uniforms.fxMap.value);
    }
    this.update(0);
    return this;
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
    this.aspect = w / h;
    this.dpr = dpr;
    if (this.pathTall) this.path = this.aspect < 0.9 ? this.pathTall : this.pathWide;
  }

  setProgress(t) { this.state.target = THREE.MathUtils.clamp(t, 0, 1); }
  setMouse(x, y) { this.mouse.set(x, y); }

  // FOV vertical efetivo: mantém a cobertura horizontal em telas muito largas.
  effectiveFov(fov) {
    const srcAspect = 1672 / 941;
    if (this.aspect <= srcAspect) return fov;
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * srcAspect / this.aspect;
    return THREE.MathUtils.radToDeg(2 * Math.atan(t));
  }

  // Quanto de uma vista está em cena agora (0..1).
  presence(scene) {
    const st = this.state;
    if (scene === st.a && scene === st.b) return 1;
    if (scene === st.a) return 1 - st.mix;
    if (scene === st.b) return st.mix;
    return 0;
  }

  // Quanto do cômodo de uma vista está em cena (0..1): textos e objetos presos a uma vista
  // continuam no lugar enquanto a câmera passa pelas vistas vizinhas do mesmo cômodo.
  areaPresence(scene) {
    const st = this.state, R = this.world.rooms, area = R[scene].area;
    return (R[st.a].area === area ? 1 - st.mix : 0) + (R[st.b].area === area ? st.mix : 0);
  }

  // Projeta um ponto (no referencial da vista) na tela. Todas as vistas estão no mesmo
  // espaço, então funciona mesmo quando a vista não está sendo desenhada.
  project(scene, point, out = {}) {
    tmp.copy(point).applyMatrix4(this.world.rooms[scene].matrix).applyMatrix4(this.cam.matrixWorldInverse);
    const depth = -tmp.z;
    tmp.applyMatrix4(this.cam.projectionMatrix);
    out.x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    out.depth = depth;
    out.front = depth > 0.05;
    out.ndcX = tmp.x; out.ndcY = tmp.y;
    return out;
  }

  // Raio da tela -> ponto da imagem da vista em cena (para interação). Ponto no referencial da vista.
  pick(clientX, clientY) {
    const scene = this.state.scene;
    const room = this.world.rooms[scene];
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const hit = ray.intersectObject(room.mesh, false)[0];
    if (!hit) return null;
    return { scene, point: hit.point.applyMatrix4(room.inverse), uv: hit.uv && { u: hit.uv.x, v: 1 - hit.uv.y } };
  }

  // Posição e direção da câmera (mundo) num momento do passeio, sem respiração nem mouse.
  pathAt(t) {
    const e = this.path.evaluate(t, { p: new THREE.Vector3(), q: new THREE.Quaternion() });
    return { p: e.p, dir: new THREE.Vector3(0, 0, -1).applyQuaternion(e.q), scene: e.scene };
  }

  update(dt) {
    this.time += dt;
    const st = this.state;
    // Rolagem suavizada: inércia de passos, não de página.
    const k = 1 - Math.exp(-dt * (this.opts.reducedMotion ? 6 : 3.4));
    const prevT = st.t;
    st.t += (st.target - st.t) * k;
    if (Math.abs(st.target - st.t) < 1e-5) st.t = st.target;
    st.velocity = (st.t - prevT) / Math.max(dt, 1e-3);

    const e = this.path.evaluate(st.t, this.eval);
    st.a = e.a; st.b = e.b; st.mix = e.mix; st.scene = e.scene;
    const roomA = this.world.rooms[e.a], roomB = this.world.rooms[e.b];

    // Pequena respiração e paralaxe do mouse: revela a profundidade.
    const pk = 1 - Math.exp(-dt * 2.5);
    this.mouseSmooth.lerp(this.mouse, pk);
    const unit = THREE.MathUtils.lerp(roomA.frame.zn, roomB.frame.zn, e.mix);  // escala local
    const amp = (this.opts.reducedMotion ? 0.3 : 1) * 0.055 * unit;
    const breathe = this.opts.reducedMotion ? 0 : 1;
    const cam = this.cam;
    cam.position.copy(e.p);
    cam.quaternion.copy(e.q);
    cam.updateMatrixWorld();
    const right = tmp.setFromMatrixColumn(cam.matrixWorld, 0);
    const up = tmp2.setFromMatrixColumn(cam.matrixWorld, 1);
    const bx = this.mouseSmooth.x * amp + Math.sin(this.time * 0.31) * 0.012 * unit * breathe;
    const by = -this.mouseSmooth.y * amp * 0.6 + Math.sin(this.time * 0.47 + 1.3) * 0.008 * unit * breathe;
    cam.position.addScaledVector(right, bx).addScaledVector(up, by);
    // Olhar ao longe: a câmera se volta para o ponto e a lente fecha.
    this.scopeAmt = THREE.MathUtils.lerp(this.scopeAmt, this.scope ? 1 : 0, 1 - Math.exp(-dt * 2.6));
    if (this.scope) this._scope = this.scope;
    let fov = this.fov;
    if (this._scope && this.scopeAmt > 0.001) {
      const a = THREE.MathUtils.smoothstep(this.scopeAmt, 0, 1);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(e.q);
      const dir = fwd.lerp(this._scope.point.clone().sub(cam.position).normalize(), a);
      cam.lookAt(cam.position.clone().add(dir));
      fov = THREE.MathUtils.lerp(fov, this._scope.fov, a);
    }
    cam.fov = this.effectiveFov(fov);
    cam.aspect = this.aspect;
    cam.near = 0.04 * unit;
    cam.far = 400;
    cam.updateMatrixWorld();
    // Enquadramento seguro: nunca mostrar além das bordas da imagem. Durante a travessia
    // basta que uma das duas vistas cubra cada canto (a outra preenche o resto).
    let cover = this._coverOf(roomA, cam);
    if (e.b !== e.a && e.mix > 0.001) cover = Math.max(cover, this._coverOf(roomB, cam));
    this.coverK = cover < this.coverK ? cover : THREE.MathUtils.lerp(this.coverK, cover, 1 - Math.exp(-dt * 6));
    if (this.coverK < 0.999) {
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(this.coverK * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)));
    }
    cam.updateProjectionMatrix();

    // Quão longe a câmera está do ponto de vista de cada imagem (bordas esticadas perdem peso).
    for (const r of [roomA, roomB]) {
      r.mat.uniforms.uAway.value = THREE.MathUtils.smoothstep(cam.position.distanceTo(r.origin), 0.05 * r.frame.zn, 0.6 * r.frame.zn);
    }

    // Velocidade de deslocamento -> desfoque radial na direção do movimento.
    const eps = 0.002;
    const ahead = this.path.evaluate(Math.min(1, st.t + eps), this.evalPrev);
    tmp.copy(ahead.p).sub(e.p);
    const segLen = tmp.length() / eps;                        // unidades por unidade de t
    const speed = (segLen * Math.abs(st.velocity)) / Math.max(unit, 0.05);
    if (tmp.lengthSq() > 1e-10) {
      tmp.normalize().multiplyScalar(Math.sign(st.velocity || 1) * 10).add(cam.position);
      tmp.project(cam);
      if (Math.abs(tmp.x) < 3 && Math.abs(tmp.y) < 3 && tmp.z < 1) this.fx.foe.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      else this.fx.foe.set(0.5, 0.5);
    }
    const motionGain = (this.tracks.get('motionGain', st.t) ?? 1) * (this.opts.reducedMotion ? 0 : 1);
    const targetMotion = THREE.MathUtils.clamp(speed * 0.0065, 0, 0.075) * motionGain;
    this.motion = THREE.MathUtils.lerp(this.motion, targetMotion, 1 - Math.exp(-dt * 10));

    // Foco de lente (trilhas + inspeção de objetos).
    let dof = 0;
    for (const f of this.focusDefs) {
      if (st.t < f.from || st.t > f.to) continue;
      const w = st.t < f.peak[0]
        ? THREE.MathUtils.smoothstep(st.t, f.from, f.peak[0])
        : 1 - THREE.MathUtils.smoothstep(st.t, f.peak[1], f.to);
      const pr = this.project(f.scene, f.point, {});
      if (pr && pr.front) {
        this.fx.focus.set(pr.x / window.innerWidth, 1 - pr.y / window.innerHeight, f.radius);
        dof = Math.max(dof, w * f.amount);
      }
    }
    this.inspectAmt = THREE.MathUtils.lerp(this.inspectAmt, this.inspect ? 1 : 0, 1 - Math.exp(-dt * 4));
    if (this.inspect) {
      const pr = this.project(this.inspect.scene, this.inspect.point, {});
      if (pr) this._inspectFocus = [pr.x / window.innerWidth, 1 - pr.y / window.innerHeight, this.inspect.radius || 0.12];
    }
    if (this._inspectFocus && this.inspectAmt > 0.01) {
      const [fx, fy, fr] = this._inspectFocus;
      const a = this.inspectAmt;
      this.fx.focus.set(THREE.MathUtils.lerp(this.fx.focus.x, fx, a), THREE.MathUtils.lerp(this.fx.focus.y, fy, a), THREE.MathUtils.lerp(this.fx.focus.z, fr, a));
      dof = Math.max(dof, a * 0.95);
    }
    this.fx.dof = dof;

    // Luzes: aumento local quando o visitante chega perto de uma lanterna; noite por área.
    for (const r of Object.values(this.world.rooms)) {
      const boosts = this.lightBoost[r.name] || {};
      r.lights.forEach((L, i) => { L.w = THREE.MathUtils.lerp(L.w, boosts[i] || 0, 1 - Math.exp(-dt * 6)); });
      r.mat.uniforms.uNight.value = this.night * (r.cfg.night ?? 0.4);
    }
    this.world.update(this.time, this.dpr);
  }

  _coverOf(room, cam) {
    const pc = this._pc || (this._pc = { fov: 0, aspect: 1, matrixWorld: new THREE.Matrix4() });
    pc.fov = cam.fov; pc.aspect = cam.aspect;
    pc.matrixWorld.multiplyMatrices(room.inverse, cam.matrixWorld);
    return this._cover(room.frame, pc);
  }

  // Fator de zoom (<= 1) que impede a vista de escapar pelas bordas da imagem:
  // cada canto da tela lança um raio que caminha pelo relevo da cena; se o raio
  // sai da imagem antes de tocar a superfície, a lente fecha um pouco.
  _cover(frame, cam) {
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tanX = tanY * cam.aspect;
    const m = cam.matrixWorld;
    const pos = this._cv || (this._cv = { p: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), q: new THREE.Vector3(), d: new THREE.Vector3() });
    pos.p.setFromMatrixPosition(m);
    pos.r.setFromMatrixColumn(m, 0);
    pos.u.setFromMatrixColumn(m, 1);
    pos.f.setFromMatrixColumn(m, 2).negate();
    const lo = -0.06, hi = 1.06; // um pouco da penumbra além da borda é aceitável
    const escapes = (k) => {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        pos.d.copy(pos.f).addScaledVector(pos.r, sx * tanX * k).addScaledVector(pos.u, sy * tanY * k).normalize();
        // o que importa é onde o raio toca a superfície (o ar é transparente)
        let s = 0.04 * frame.zn, pr = null;
        for (let i = 0; i < 32; i++, s *= 1.26) {
          pos.q.copy(pos.p).addScaledVector(pos.d, s);
          if (pos.q.z > -0.02) continue;
          pr = frame.project(pos.q);
          if (pr.z >= frame.depthAt(pr.u, pr.v)) break;
        }
        if (pr && (pr.u < lo || pr.u > hi || pr.v < lo || pr.v > hi)) return true;
      }
      return false;
    };
    if (!escapes(1)) return 1;
    let a = 0.5, b = 1;
    for (let i = 0; i < 7; i++) { const k = (a + b) / 2; if (escapes(k)) b = k; else a = k; }
    return a;
  }

  render() {
    const r = this.renderer;
    const st = this.state;
    const A = this.world.rooms[st.a], B = this.world.rooms[st.b];
    const draw = (room, target) => {
      r.setRenderTarget(target);
      r.clear(true, true, true);
      r.render(room.scene, this.cam);
    };
    let source;
    const solo = A === B || st.mix < 0.002 ? A : st.mix > 0.998 ? B : null;
    if (solo) {
      draw(solo, this.post.sceneRT);
      source = this.post.sceneRT;
      // fora do ponto de vista da imagem, as bordas esticadas também vão para a penumbra
      if (solo.mat.uniforms.uAway.value > 0.02) {
        r.setRenderTarget(this.post.layerRT);
        r.clear(true, true, true);
        source = this.post.blend(0);
      }
    } else {
      draw(A, this.post.sceneRT);
      draw(B, this.post.layerRT);
      source = this.post.blend(st.mix);
    }

    const t = st.t;
    // Entrada: primeiro só as lanternas, depois a luz do dia chega devagar.
    const ii = THREE.MathUtils.smoothstep(this.intro, 0, 1);
    this.fx.fade.w = Math.pow(1 - ii, 3) * 0.85;
    const sat = this.tracks.get('saturation', t) ?? 1;
    // Passagens: a luz se fecha em volta do caminho, só o que está adiante brilha.
    const tunnel = (this.tracks.get('tunnel', t) ?? 0) * (this.opts.reducedMotion ? 0.5 : 1);
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

  // Ajuste automático de resolução se o aparelho estiver sofrendo.
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
