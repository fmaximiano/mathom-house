// Portais: ligam um recorte da cena A (porta, arco, quadro) a um ponto da cena B.
// A matriz M leva coordenadas de A para B. Atravessar o recorte = trocar de referencial.
import * as THREE from '../../vendor/three.module.min.js';
import { quatLookAlong } from './frame.js';

export class Portal {
  /**
   * @param from   SceneFrame da cena de origem
   * @param hole   { center:[u,v], plane:[a,b,c] } do manifest (disparidade do plano)
   * @param opts   { center?:[u,v], align?:0..1 (0 = normal do plano, 1 = raio da câmera),
   *                 exit: { pos:Vector3, forward:Vector3 } no referencial de B, scale }
   */
  constructor(from, hole, opts) {
    const [a, b, c] = hole.plane;
    const [uc, vc] = opts.center || hole.center;
    const disp = (u, v) => a * u + b * v + c;
    const P = (u, v) => from.point(u, v, from.zFromDisp(disp(u, v)));
    const C = P(uc, vc);
    const tu = P(uc + 0.02, vc).sub(C);
    const tv = P(uc, vc + 0.02).sub(C);
    const n = new THREE.Vector3().crossVectors(tu, tv).normalize();
    if (n.dot(C) < 0) n.negate();
    const ray = C.clone().normalize();
    const align = opts.align ?? 0.5;
    const fwdA = n.clone().lerp(ray, align).normalize();
    if (opts.yaw) fwdA.applyAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw);
    if (opts.pitch) fwdA.applyAxisAngle(new THREE.Vector3(1, 0, 0), opts.pitch);

    this.posA = C.clone().addScaledVector(fwdA, opts.push || 0);
    this.fwdA = fwdA;
    this.quatA = quatLookAlong(fwdA);
    this.posB = opts.exit.pos.clone();
    this.fwdB = opts.exit.forward.clone().normalize();
    this.quatB = quatLookAlong(this.fwdB);
    this.scale = opts.scale ?? 1;

    const TA = new THREE.Matrix4().compose(this.posA, this.quatA, new THREE.Vector3(1, 1, 1));
    const TB = new THREE.Matrix4().compose(this.posB, this.quatB, new THREE.Vector3(1, 1, 1));
    const S = new THREE.Matrix4().makeScale(this.scale, this.scale, this.scale);
    this.M = TB.clone().multiply(S).multiply(TA.clone().invert()); // A -> B
    this.Minv = this.M.clone().invert();                          // B -> A
  }

  toB(p) { return p.clone().applyMatrix4(this.M); }
  toA(p) { return p.clone().applyMatrix4(this.Minv); }

  // Par de keyframes idênticos visualmente, um em cada referencial.
  crossing(t, fromName, toName, extra = {}) {
    const lookA = this.posA.clone().addScaledVector(this.fwdA, 10);
    return [
      { t, s: fromName, p: this.posA.toArray(), l: lookA.toArray(), cross: true, ...extra },
      { t, s: toName, p: this.posB.toArray(), l: this.toB(lookA).toArray(), cross: true, ...extra },
    ];
  }
}
