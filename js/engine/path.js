// Trajeto da câmera: passa pelo ponto exato de onde cada imagem foi "fotografada",
// sem parar — posição e mira seguem curvas de Hermite de tempo não uniforme (a
// velocidade é contínua de uma vista à outra). No caminho, a vista de origem cede
// lugar à de destino.
import * as THREE from '../../vendor/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);

// Dá `t` às vistas intermediárias (as que não têm): proporcional ao caminho entre as duas
// vistas com `t` fixo que as cercam — distância andada mais um tanto pelo giro da câmera.
export function fillTimes(shots, world) {
  const room = (s) => world.rooms[s.id];
  const step = (a, b) => {
    const qa = new THREE.Quaternion().setFromRotationMatrix(room(a).matrix);
    const qb = new THREE.Quaternion().setFromRotationMatrix(room(b).matrix);
    return room(a).origin.distanceTo(room(b).origin) + qa.angleTo(qb) * 1.0;   // 1 m por radiano
  };
  for (let i = 0; i < shots.length; i++) {
    if (!shots[i].via) continue;
    let a = i - 1, b = i + 1;
    while (shots[a].via) a--;
    while (shots[b].via) b++;
    let total = 0, upto = 0;
    for (let k = a; k < b; k++) {
      const d = step(shots[k], shots[k + 1]);
      total += d;
      if (k < i) upto += d;
    }
    shots[i].t = shots[a].t + (shots[b].t - shots[a].t) * (upto / Math.max(total, 1e-6));
  }
}
const TENSION = 0.7;   // < 1: curvas mais contidas (a câmera não "abre" demais nas curvas)

export class ShotPath {
  /**
   * @param shots  [{ id, t, look?:[u,v], blend?:[u0,u1] }] em ordem de t
   * @param extra  quadros-chave além das vistas: [{ t, s: id, p:[x,y,z], l:[x,y,z] }] (referencial da vista s)
   * @param world  World carregado (poses de cada vista)
   * @param tall   tela em pé: mira no ponto `look` de cada vista em vez do centro
   */
  constructor(shots, extra, world, tall = false) {
    this.shots = shots;
    const keys = shots.map((s) => {
      const room = world.rooms[s.id];
      const q = new THREE.Quaternion().setFromRotationMatrix(room.matrix);
      if (tall && s.look) {
        // gira só no eixo vertical (o horizonte continua reto)
        const d = room.frame.point(s.look[0], s.look[1], 1);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-d.x, -d.z)));
      }
      return key(s.t, room.origin.clone(), q, room.info.mid);
    });
    for (const k of extra) {
      const room = world.rooms[k.s];
      const p = world.toWorld(k.s, new THREE.Vector3().fromArray(k.p));
      const l = world.toWorld(k.s, new THREE.Vector3().fromArray(k.l));
      const up = UP.clone().applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(room.matrix));
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, l, up));
      keys.push(key(k.t, p, q, room.info.mid));
    }
    this.keys = keys.sort((a, b) => a.t - b.t);
    this.tangents = this.keys.map((_, i) => this._tangent(i));
    this._m = new THREE.Matrix4();
    this._r = new THREE.Quaternion();
  }

  // Direção média dos dois trechos vizinhos, com a velocidade do mais lento deles: um trecho
  // longo não "empurra" a câmera para além do ponto no trecho curto seguinte. Nas pontas, repouso.
  _tangent(i) {
    const K = this.keys, k = K[i], a = K[i - 1], b = K[i + 1];
    const out = { p: new THREE.Vector3(), l: new THREE.Vector3(), roll: 0 };
    if (!a || !b) return out;
    const da = k.t - a.t, db = b.t - k.t;
    for (const w of ['p', 'l']) {
      const s1 = k[w].clone().sub(a[w]).divideScalar(da);
      const s2 = b[w].clone().sub(k[w]).divideScalar(db);
      const speed = Math.min(s1.length(), s2.length());
      const dir = s1.clone().multiplyScalar(db).add(s2.clone().multiplyScalar(da));
      out[w] = dir.lengthSq() > 1e-12 ? dir.normalize().multiplyScalar(speed * TENSION) : dir;
    }
    out.roll = (((k.roll - a.roll) / da) * db + ((b.roll - k.roll) / db) * da) / (da + db) * TENSION;
    return out;
  }

  evaluate(t, out) {
    const K = this.keys, S = this.shots;
    t = THREE.MathUtils.clamp(t, K[0].t, K[K.length - 1].t);
    let i = 0;
    while (i + 1 < K.length && K[i + 1].t <= t) i++;
    const j = Math.min(i + 1, K.length - 1);
    const a = K[i], b = K[j];
    const dt = b.t - a.t || 1;
    const u = j === i ? 0 : (t - a.t) / dt;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const ta = this.tangents[i], tb = this.tangents[j];
    const l = out.l || (out.l = new THREE.Vector3());
    for (const [w, v] of [['p', out.p], ['l', l]]) {
      v.copy(a[w]).multiplyScalar(h00).addScaledVector(ta[w], h10 * dt)
        .addScaledVector(b[w], h01).addScaledVector(tb[w], h11 * dt);
    }
    const roll = a.roll * h00 + ta.roll * h10 * dt + b.roll * h01 + tb.roll * h11 * dt;
    out.q.setFromRotationMatrix(this._m.lookAt(out.p, l, UP)).multiply(this._r.setFromAxisAngle(Z, roll));
    out.u = u;
    // Qual par de vistas está em cena, e quanto de cada uma.
    let s = 0;
    while (s + 1 < S.length && S[s + 1].t <= t) s++;
    const next = S[s + 1];
    if (!next) {
      out.a = out.b = S[s].id; out.mix = 0;
    } else {
      const v = (t - S[s].t) / (next.t - S[s].t);
      const [b0, b1] = next.blend || [0.3, 0.75];
      out.a = S[s].id; out.b = next.id;
      out.mix = THREE.MathUtils.smoothstep(v, b0, b1);
    }
    out.scene = out.mix < 0.5 ? out.a : out.b;
    return out;
  }
}

const Z = new THREE.Vector3(0, 0, 1);

// Quadro-chave: posição, ponto de mira (à frente, na profundidade típica da vista)
// e o giro em torno do eixo de visão que o "olhar para" nivelado não reproduz.
function key(t, p, q, reach) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const r0 = new THREE.Vector3().crossVectors(f, UP).normalize();
  const u0 = new THREE.Vector3().crossVectors(r0, f);
  const roll = Math.atan2(-up.dot(r0), up.dot(u0));
  return { t, p, l: p.clone().addScaledVector(f, reach), roll };
}

// Trilhas de efeitos: { nome: [[t, valor], ...] } com transição suave (smoothstep).
export class Tracks {
  constructor(tracks) { this.tracks = tracks; }
  get(name, t) {
    const tr = this.tracks[name];
    if (!tr) return undefined;
    if (t <= tr[0][0]) return tr[0][1];
    for (let i = 0; i < tr.length - 1; i++) {
      const [t0, v0] = tr[i], [t1, v1] = tr[i + 1];
      if (t < t1) {
        let u = (t - t0) / (t1 - t0);
        u = u * u * (3 - 2 * u);
        if (Array.isArray(v0)) return v0.map((x, k) => x + (v1[k] - x) * u);
        return v0 + (v1 - v0) * u;
      }
    }
    return tr[tr.length - 1][1];
  }
}
