// Monta as vistas do passeio: o relevo 3D de cada imagem, posto no lugar de onde ela
// foi "fotografada" (todas no mesmo espaço), com luzes, vegetação e partículas.
import * as THREE from '../../vendor/three.module.min.js';
import { SceneFrame } from './frame.js';
import { sceneVert, sceneFrag, particleVert, particleFrag } from './shaders.js';

const ASSETS = 'assets/scenes/';

async function loadDepth(url, gw, gh) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`falha ao carregar ${url}`);
  const { data } = await res.json();
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  const g = new Uint16Array(buf);
  // desfaz o delta por linha
  for (let r = 0; r < gh; r++) {
    const o = r * gw;
    for (let i = 1; i < gw; i++) g[o + i] = (g[o + i - 1] + g[o + i]) & 0xffff;
  }
  return g;
}

function loadTexture(loader, url, color = true, wrap = THREE.ClampToEdgeWrapping) {
  return new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = wrap;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, () => reject(new Error(`falha ao carregar ${url}`)));
  });
}

export class World {
  constructor(renderer, direction) {
    this.renderer = renderer;
    this.dir = direction;   // journey.js: vistas, áreas, partículas
    this.rooms = {};
    this.time = 0;
  }

  async load({ hd = false, mobile = false, onProgress = () => {} } = {}) {
    const manifest = await (await fetch(ASSETS + 'manifest.json')).json();
    this.manifest = manifest;
    const [imgW, imgH] = manifest.image;
    const [gw, gh] = manifest.grid;
    const loader = new THREE.TextureLoader();
    const shots = this.dir.shots;
    let done = 0;
    const total = shots.length * 3;
    const tick = (x) => { done++; onProgress(done / total); return x; };
    const suffix = hd ? '@2x' : '';

    const loaded = await Promise.all(shots.map(async (shot) => {
      const name = shot.id;
      const [color, fx, depth] = await Promise.all([
        loadTexture(loader, `${ASSETS}${name}${suffix}.webp`, true, THREE.MirroredRepeatWrapping)
          .catch(() => loadTexture(loader, `${ASSETS}${name}.webp`, true, THREE.MirroredRepeatWrapping)) // sem @2x: a normal
          .then(tick),
        loadTexture(loader, `${ASSETS}${name}.fx.webp`, false).then(tick),
        loadDepth(`${ASSETS}${name}.depth.json`, gw, gh).then(tick),
      ]);
      return { shot, color, fx, depth };
    }));

    for (const { shot, color, fx, depth } of loaded) {
      const name = shot.id;
      const info = manifest.views[name];
      const area = this.dir.areas[shot.area] || {};
      const frame = new SceneFrame({ fov: manifest.fov, near: info.near, far: info.far, aspect: imgW / imgH, grid: depth, gridW: gw, gridH: gh });
      const matrix = new THREE.Matrix4().fromArray(info.matrix);
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix.copy(matrix);
      scene.add(group);
      const lights = (info.lights || []).map(([x, y, r]) => new THREE.Vector4(x, 1 - y, r, 0));
      while (lights.length < 28) lights.push(new THREE.Vector4(0, 0, 0, 0));
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: sceneVert,
        fragmentShader: sceneFrag,
        blending: THREE.NoBlending,
        uniforms: {
          map: { value: color }, fxMap: { value: fx }, uTime: { value: 0 },
          uAway: { value: 0 }, uExposure: { value: 1 }, uSway: { value: area.sway ?? 1 },
          uAspect: { value: imgW / imgH },
          uLights: { value: lights }, uLightCount: { value: Math.min(28, (info.lights || []).length) },
          uFire: { value: info.fire ? new THREE.Vector4(info.fire[0], 1 - info.fire[1], info.fire[2], 1) : new THREE.Vector4(0, 0, 0, 0) },
          uGrade: { value: new THREE.Vector3(1, 1, 1) }, uNight: { value: 0 },
        },
      });
      // malha um pouco mais leve que a grade de profundidade: são 10 relevos na memória
      const mesh = new THREE.Mesh(frame.buildGeometry(0.15, mobile ? 2.5 : 1.5), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      scene.updateMatrixWorld(true);
      const room = {
        name, area: shot.area, frame, scene, group, mesh, mat, info, cfg: { ...area, ...shot },
        lights, particles: [], matrix, inverse: matrix.clone().invert(),
        origin: new THREE.Vector3().setFromMatrixPosition(matrix),
      };
      for (const def of this.dir.particles(shot, frame, info) || []) {
        room.particles.push(this._particles(group, def, mobile));
      }
      this.rooms[name] = room;
    }
    return this;
  }

  _particles(parent, def, mobile) {
    const n = Math.round(def.count * (mobile ? 0.5 : 1));
    const seeds = new Float32Array(n * 4);
    const min = new THREE.Vector3().fromArray(def.min), max = new THREE.Vector3().fromArray(def.max);
    const size = max.clone().sub(min);
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = min.x + Math.random() * size.x;
      seeds[i * 4 + 1] = min.y + Math.random() * size.y;
      seeds[i * 4 + 2] = min.z + Math.random() * size.z;
      seeds[i * 4 + 3] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const mode = { dust: 0, ember: 1, firefly: 2, bird: 3 }[def.kind] ?? 0;
    const additive = mode !== 3;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: particleVert, fragmentShader: particleFrag,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: {
        uTime: { value: 0 }, uSize: { value: def.size }, uPixelRatio: { value: 1 },
        uBoxMin: { value: min }, uBoxSize: { value: size },
        uDrift: { value: new THREE.Vector3().fromArray(def.drift || [0, 0.02, 0]) },
        uTurb: { value: def.turb ?? 0.1 }, uMode: { value: mode },
        uColor: { value: new THREE.Color(...(def.color || [1, 0.8, 0.5])) },
        uOpacity: { value: def.opacity ?? 1 },
      },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    parent.add(pts);
    return { pts, mat, def };
  }

  // Ponto do referencial de uma vista -> mundo (e o caminho de volta).
  toWorld(name, p) { return p.clone().applyMatrix4(this.rooms[name].matrix); }
  toLocal(name, p) { return p.clone().applyMatrix4(this.rooms[name].inverse); }
  convert(p, from, to) { return from === to ? p.clone() : this.toLocal(to, this.toWorld(from, p)); }

  update(time, pixelRatio) {
    this.time = time;
    for (const room of Object.values(this.rooms)) {
      room.mat.uniforms.uTime.value = time;
      for (const p of room.particles) {
        p.mat.uniforms.uTime.value = time;
        p.mat.uniforms.uPixelRatio.value = pixelRatio;
      }
    }
  }
}
