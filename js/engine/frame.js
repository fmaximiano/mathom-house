// Geometria de uma cena: cada imagem é vista por uma "câmera de origem" no ponto
// (0,0,0) olhando para -Z. Cada pixel vira um ponto 3D ao longo do seu raio,
// na profundidade estimada. Andar pela cena = mover a câmera dentro desse relevo.
import * as THREE from '../../vendor/three.module.min.js';

export class SceneFrame {
  constructor({ fov, near, far, aspect, grid, gridW, gridH }) {
    this.fov = fov;
    this.ty = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    this.tx = this.ty * aspect;
    this.aspect = aspect;
    this.zn = near;
    this.zf = far;
    this.grid = grid;       // Uint16Array (gridW * gridH), disparidade 0..65535
    this.gw = gridW;
    this.gh = gridH;
  }

  // disparidade (0 longe .. 1 perto) -> profundidade z
  zFromDisp(d) {
    return 1 / (d * (1 / this.zn - 1 / this.zf) + 1 / this.zf);
  }

  // disparidade na grade (u, v com v de cima para baixo), interpolação bilinear
  dispAt(u, v) {
    const x = THREE.MathUtils.clamp(u, 0, 1) * (this.gw - 1);
    const y = THREE.MathUtils.clamp(v, 0, 1) * (this.gh - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.gw - 1), y1 = Math.min(y0 + 1, this.gh - 1);
    const fx = x - x0, fy = y - y0;
    const g = this.grid, w = this.gw;
    const a = g[y0 * w + x0], b = g[y0 * w + x1], c = g[y1 * w + x0], d = g[y1 * w + x1];
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) / 65535;
  }

  depthAt(u, v) {
    return this.zFromDisp(this.dispAt(u, v));
  }

  // ponto 3D na direção do pixel (u, v) à profundidade z
  point(u, v, z, out = new THREE.Vector3()) {
    return out.set((2 * u - 1) * this.tx * z, (1 - 2 * v) * this.ty * z, -z);
  }

  // ponto na superfície da imagem, opcionalmente recuado dz em direção à origem
  surface(u, v, dz = 0, out = new THREE.Vector3()) {
    return this.point(u, v, Math.max(0.05, this.depthAt(u, v) - dz), out);
  }

  // projeção inversa: ponto 3D (no referencial da cena) -> uv da imagem
  project(p) {
    const z = -p.z;
    return { u: (p.x / (this.tx * z) + 1) / 2, v: (1 - p.y / (this.ty * z)) / 2, z };
  }

  // Profundidade além das bordas da imagem: a superfície da borda continua
  // (chão, paredes) em vez de parar — assim a câmera pode olhar um pouco além.
  depthBeyond(u, v) {
    const uc = THREE.MathUtils.clamp(u, 0, 1), vc = THREE.MathUtils.clamp(v, 0, 1);
    const z0 = this.depthAt(uc, vc);
    if (uc === u && vc === v) return z0;
    const h = 0.03;
    let dz = 0;
    if (u !== uc) { const s = Math.sign(u - uc); dz += (z0 - this.depthAt(uc - s * h, vc)) / h * Math.abs(u - uc); }
    if (v !== vc) { const s = Math.sign(v - vc); dz += (z0 - this.depthAt(uc, vc - s * h)) / h * Math.abs(v - vc); }
    return THREE.MathUtils.clamp(z0 + dz, Math.max(this.zn * 0.55, z0 * 0.55), z0 * 1.6);
  }

  // Malha de relevo. margin: quanto a malha se estende além da imagem (fração).
  buildGeometry(margin = 0.2, step = 1) {
    const nx = Math.round(((this.gw - 1) * (1 + 2 * margin)) / step) + 1;
    const ny = Math.round(((this.gh - 1) * (1 + 2 * margin)) / step) + 1;
    const pos = new Float32Array(nx * ny * 3);
    const uvs = new Float32Array(nx * ny * 2);
    const p = new THREE.Vector3();
    let k = 0, q = 0;
    for (let j = 0; j < ny; j++) {
      const v = -margin + ((1 + 2 * margin) * j) / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = -margin + ((1 + 2 * margin) * i) / (nx - 1);
        this.point(u, v, this.depthBeyond(u, v), p);
        pos[k++] = p.x; pos[k++] = p.y; pos[k++] = p.z;
        uvs[q++] = u; uvs[q++] = 1 - v;
      }
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    k = 0;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // Superfície de paisagem distante (World-rim): cobre um retângulo da imagem
  // (pode passar das bordas) numa profundidade que varia do céu ao vale.
  buildLandscape(rect, depthFn, nx = 120, ny = 90, extend = 0.18) {
    // A malha passa um pouco da pintura estendida; ali a textura se espelha.
    const [r0, s0, r1, s1] = rect;
    const du = (r1 - r0) * extend, dv = (s1 - s0) * extend;
    const [u0, v0, u1, v1] = [r0 - du, s0 - dv, r1 + du, s1 + dv];
    const pos = new Float32Array(nx * ny * 3);
    const uvs = new Float32Array(nx * ny * 2);
    const p = new THREE.Vector3();
    let k = 0, q = 0;
    for (let j = 0; j < ny; j++) {
      const fy = j / (ny - 1);
      const v = v0 + (v1 - v0) * fy;
      for (let i = 0; i < nx; i++) {
        const fx = i / (nx - 1);
        const u = u0 + (u1 - u0) * fx;
        this.point(u, v, depthFn(v), p);
        pos[k++] = p.x; pos[k++] = p.y; pos[k++] = p.z;
        uvs[q++] = (u - r0) / (r1 - r0); uvs[q++] = 1 - (v - s0) / (s1 - s0);
      }
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    k = 0;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

// Base ortonormal "olhando para forward" como quaternion (câmera olha para -Z).
export function quatLookAlong(forward, up = new THREE.Vector3(0, 1, 0)) {
  const z = forward.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
