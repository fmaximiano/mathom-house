// A direção da Mathom-house: as vistas do passeio, os cômodos, luz e ritmo.
// t vai de 0 (diante da Round Door) a 1 (junto à janela do World-rim).
import * as THREE from '../vendor/three.module.min.js';

// Vistas, na ordem do passeio. Cada uma é uma imagem de assets/scenes/ (sNN.webp),
// fotografada de um ponto que tools/solve_poses.py descobriu. A câmera passa
// exatamente por esse ponto em `t`, e entre duas vistas uma se funde na outra.
// As vistas principais (s01…s10) têm `t` fixo; as intermediárias (via: true, como s02b,
// "entre s02 e s03") ganham o `t` proporcional à distância que a câmera anda até elas.
//   look   ponto de interesse (u, v) — para onde a câmera mira em telas em pé
//   blend  trecho da travessia (0..1) em que esta vista substitui a anterior
export const SHOTS = [
  { id: 's01', area: 'door', t: 0.0, look: [0.38, 0.45] },
  { id: 's02', area: 'door', t: 0.1, look: [0.4, 0.45], blend: [0.15, 0.8] },
  { id: 's02b', area: 'door', via: true, look: [0.45, 0.45] },
  { id: 's03', area: 'hall', t: 0.2, look: [0.72, 0.5], blend: [0.45, 0.85] },
  { id: 's03b', area: 'hall', via: true, look: [0.7, 0.45] },
  { id: 's04', area: 'hall', t: 0.3, look: [0.72, 0.45] },
  { id: 's05', area: 'wright', t: 0.4, look: [0.5, 0.45], blend: [0.4, 0.82] },
  { id: 's05b', area: 'wright', via: true, look: [0.5, 0.45] },
  { id: 's06', area: 'wright', t: 0.5, look: [0.62, 0.45] },
  { id: 's06b', area: 'wright', via: true, look: [0.62, 0.45] },
  { id: 's06c', area: 'wright', via: true, look: [0.66, 0.45] },
  { id: 's07', area: 'mathom', t: 0.6, look: [0.6, 0.45] },
  { id: 's08', area: 'mathom', t: 0.7, look: [0.5, 0.45] },
  { id: 's08b', area: 'mathom', via: true, look: [0.45, 0.45] },
  { id: 's08c', area: 'mathom', via: true, look: [0.62, 0.45] },
  { id: 's09', area: 'worldrim', t: 0.8, look: [0.5, 0.4], blend: [0.35, 0.8] },
  { id: 's09b', area: 'worldrim', via: true, look: [0.55, 0.4] },
  { id: 's10', area: 'worldrim', t: 0.9, look: [0.6, 0.35] },
];
const MAIN = SHOTS.filter((s) => !s.via);

// Cômodos: nome no mapa, quanto a noite escurece, quanto a vegetação balança.
const AREA_INFO = {
  door: { name: 'Round Door', night: 1, sway: 1.2 },
  hall: { name: 'Hall', night: 0.4, sway: 0.6 },
  wright: { name: 'Wright-room', night: 0.4, sway: 0.6 },
  mathom: { name: 'Mathom', night: 0.4, sway: 0.5 },
  worldrim: { name: 'World-rim', night: 0.55, sway: 0.8 },
};

// Paradas da rolagem, só com ?vistas na URL (cada gesto leva à seguinte): cada vista e,
// no fim, dois passos rumo à janela. Sem o parâmetro, a rolagem é contínua.
export const STOPS = [...MAIN.map((s) => s.t), 0.95, 1];

// Áreas (para o mapa, o som e a navegação).
// t = para onde o mapa leva; from = a partir de quando o cômodo conta como "aqui".
export const AREAS = Object.entries(AREA_INFO).map(([id, a]) => {
  const i = MAIN.findIndex((s) => s.area === id);
  const prev = MAIN[i - 1];
  return { id, name: a.name, t: MAIN[i].t, from: prev ? (prev.t + MAIN[i].t) / 2 : 0 };
});

// O quadro sobre a lareira (u0, v0, u1, v1), onde ele aparece. Olhá-lo tem consequências.
export const PAINTINGS = {
  s06c: [0.63, 0.14, 0.73, 0.26], s07: [0.57, 0.12, 0.66, 0.26],
  s08: [0.29, 0.0, 0.41, 0.15], s08b: [0.22, 0.0, 0.31, 0.13],
};

export const direction = {
  shots: SHOTS,
  areas: AREA_INFO,

  // Quadros-chave além das vistas: no fim, a câmera se aproxima da janela redonda.
  extraKeys(world) {
    const f = world.rooms.s10.frame;
    const hub = f.point(0.635, 0.27, 1).normalize();
    const wall = f.depthAt(0.62, 0.575);        // o peitoril, logo abaixo da janela
    const p = hub.clone().multiplyScalar(wall * 0.3).add(new THREE.Vector3(0, 0.02 * wall, 0));
    // mira só um pouco rumo à janela: olhar alto demais sairia da imagem (e a lente fecharia)
    const l = f.point(0.5, 0.45, 1).normalize().lerp(hub, 0.35).multiplyScalar(wall * 12);
    return [{ t: 1, s: 's10', p: p.toArray(), l: l.toArray() }];
  },

  // Trilhas de luz e lente ao longo do passeio.
  tracks: {
    exposure: [[0, 1], [0.1, 1], [0.15, 0.9], [0.2, 1], [0.35, 0.96], [0.4, 1], [0.9, 1.03], [1, 1.14]],
    bloom: [[0, 0.5], [0.12, 0.6], [0.2, 0.5], [0.6, 0.55], [0.8, 0.62], [0.9, 0.72], [1, 1.15]],
    saturation: [[0, 1.02], [0.15, 0.96], [0.2, 1.02], [0.9, 1.05], [1, 1.08]],
    vignette: [[0, 0.36], [0.15, 0.46], [0.2, 0.38], [0.35, 0.44], [0.4, 0.38], [0.75, 0.44], [0.8, 0.34], [1, 0.26]],
    motionGain: [[0, 1], [1, 1]],
    // passagens: a luz se fecha em volta do caminho, só o que está adiante brilha
    tunnel: [[0, 0], [0.12, 0], [0.155, 0.3], [0.185, 0], [0.33, 0], [0.36, 0.35], [0.39, 0], [0.73, 0], [0.76, 0.3], [0.79, 0], [1, 0]],
  },

  // Foco de lente: pontos que a câmera "olha com atenção" (referencial da vista).
  focus(world) {
    return [
      { from: 0.0, to: 0.06, peak: [0.0, 0.025], scene: 's01', point: world.rooms.s01.frame.surface(0.38, 0.46), radius: 0.3, amount: 0.35 },
    ];
  },

  // Partículas de cada vista (caixas no referencial da vista, proporcionais à profundidade típica).
  particles(shot, f, info) {
    const m = info.mid;
    const box = (z0, z1, y0 = -0.6, y1 = 0.8, w = 0.9) => ({
      min: [-f.tx * z1 * w, f.ty * z1 * y0, -z1], max: [f.tx * z1 * w, f.ty * z1 * y1, -z0],
    });
    const k = m / 5;                       // escala do movimento
    const list = [];
    if (shot.area === 'door') {
      list.push({ kind: 'dust', count: 150, ...box(m * 0.35, m * 1.2), drift: [0.05 * k, 0.015 * k, 0], turb: 0.25 * k, size: 30 * k, color: [1, 0.86, 0.58], opacity: 0.55 });
      list.push({ kind: 'firefly', count: 34, ...box(m * 0.4, m * 1.1, -0.8, 0.1), drift: [0.02 * k, 0.01 * k, 0], turb: 0.4 * k, size: 44 * k, color: [1, 0.88, 0.45], opacity: 0.9 });
    } else {
      const warm = shot.area === 'worldrim' ? [1, 0.84, 0.55] : [1, 0.88, 0.66];
      list.push({ kind: 'dust', count: 150, ...box(m * 0.3, m * 0.95, -0.4, 0.7, 0.8), drift: [0.03 * k, 0.006 * k, 0], turb: 0.12 * k, size: 20 * k, color: warm, opacity: 0.45 });
      list.push({ kind: 'dust', count: 90, ...box(m * 0.3, m * 1.3), drift: [0.01 * k, 0.004 * k, 0], turb: 0.1 * k, size: 16 * k, color: [1, 0.8, 0.55], opacity: 0.26 });
    }
    if (info.fire) {
      const c = f.surface(info.fire[0], info.fire[1], 0.05 * m);
      const r = info.fire[2] * f.tx * 2 * -c.z;           // raio do fogo em unidades da cena
      list.push({ kind: 'ember', count: 46, min: [c.x - r, c.y - r * 0.3, c.z], max: [c.x + r, c.y + r * 5, c.z + r * 1.5], drift: [0, 0.28 * k, 0.02 * k], turb: 0.05 * k, size: 16 * k, color: [1, 0.48, 0.14], opacity: 1 });
    }
    return list;
  },
};
