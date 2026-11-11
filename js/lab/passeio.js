// Laboratório: o passeio pré-renderizado no Blender, rolado quadro a quadro.
// Cada posição da página mostra sempre o mesmo quadro. Os quadros chegam do mais
// espaçado ao mais fino (1 a cada 32, 16, 8…), então dá para rolar desde o começo:
// enquanto um quadro não chega, aparece o vizinho mais próximo já carregado.
import * as THREE from '../../vendor/three.module.min.js';

const PASTA = 'assets/passeio/';
const $ = (s) => document.querySelector(s);
const tela = $('#tela');
const ctx = tela.getContext('2d');
const info = $('[data-info]');

function aviso(html) {
  const el = $('[data-aviso]');
  el.innerHTML = `<div>${html}</div>`;
  el.hidden = false;
}

async function iniciar() {
  let meta, cam;
  try {
    [meta, cam] = await Promise.all([
      fetch(PASTA + 'passeio.json').then((r) => { if (!r.ok) throw r; return r.json(); }),
      fetch(PASTA + 'camera.json').then((r) => { if (!r.ok) throw r; return r.json(); }),
    ]);
  } catch {
    aviso(`Ainda não há passeio renderizado.<br><br>Renderize com <code>tools/blender/render_passeio.py</code> e prepare com
      <code>python tools/blender/preparar_web.py pasta/do/render</code>.<br>Os arquivos ficam em <code>assets/passeio/</code>.`);
    return;
  }
  const N = meta.quadros;
  const pequena = Math.min(screen.width, screen.height) < 700 || window.innerWidth * devicePixelRatio < 1300;
  const pasta = PASTA + (pequena ? 'quadros-960/' : 'quadros/');
  const existe = new Set(meta.existentes);
  const quadros = Array.from({ length: N }, (_, i) => ({ n: i + 1, img: null, pronto: false, existe: existe.has(i + 1) }));

  // ordem de carga: do mais espaçado ao mais fino; perto de onde se está, primeiro
  const fila = [];
  const visto = new Set();
  for (let passo = 32; passo >= 1; passo /= 2) {
    for (let i = 0; i < N; i += passo) if (!visto.has(i)) { visto.add(i); fila.push(i); }
  }
  let carregados = 0, ativos = 0;
  const nome = (i) => String(i + 1).padStart(4, '0');
  function proximo() {
    while (ativos < 6 && fila.length) {
      const i = fila.shift();
      const q = quadros[i];
      if (q.img || !q.existe) continue;
      ativos++;
      q.img = new Image();
      q.img.decoding = 'async';
      q.img.src = pasta + nome(i) + '.webp';
      q.img.decode().then(() => { q.pronto = true; }).catch(() => {}).finally(() => {
        ativos--; carregados++;
        $('[data-barra]').style.width = `${(carregados / existe.size) * 100}%`;
        desenhar(true);
        proximo();
      });
    }
  }
  function priorizar(i) {
    for (let d = 8; d >= 0; d--) for (const j of [i - d, i + d]) {
      if (j >= 0 && j < N && !quadros[j].img) { const k = fila.indexOf(j); if (k > 0) fila.splice(k, 1); fila.unshift(j); }
    }
  }
  proximo();

  // luzes: tremulam por cima do quadro (mistura aditiva)
  const luzes = meta.luzes ? Array.from({ length: N }, () => null) : null;
  function luz(i) {
    if (!luzes) return null;
    if (!luzes[i]) { luzes[i] = new Image(); luzes[i].src = PASTA + 'luzes/' + nome(i) + '.webp'; }
    return luzes[i].complete && luzes[i].naturalWidth ? luzes[i] : null;
  }

  // clicáveis: o canal ids diz qual objeto está em cada pixel
  const clic = Object.fromEntries((cam.clicaveis || []).map((c) => [c.indice, c.nome]));
  const idsCanvas = document.createElement('canvas');
  const idsCtx = idsCanvas.getContext('2d', { willReadFrequently: true });
  const idsCache = new Map();    // quadro -> { w, h, px, centros: {índice: [u, v]} } (só o que aparece no quadro)
  function ids(k) {
    if (!meta.ids || !Object.keys(clic).length) return null;
    if (!idsCache.has(k)) {
      idsCache.set(k, null);
      const img = new Image();
      img.src = PASTA + 'ids/' + nome(k) + '.png';
      img.onload = () => {
        idsCanvas.width = img.width; idsCanvas.height = img.height;
        idsCtx.drawImage(img, 0, 0);
        const d = idsCtx.getImageData(0, 0, img.width, img.height).data;
        const px = new Uint8Array(img.width * img.height), soma = {};
        for (let i = 0; i < px.length; i++) {
          const v = px[i] = d[i * 4];
          if (!clic[v]) continue;
          const s = soma[v] || (soma[v] = [0, 0, 0]);
          s[0] += i % img.width; s[1] += Math.floor(i / img.width); s[2]++;
        }
        const centros = {};
        for (const [v, [x, y, n]] of Object.entries(soma)) if (n > 40) centros[v] = [x / n / img.width, y / n / img.height];
        idsCache.set(k, { w: img.width, h: img.height, px, centros });
        if (idsCache.size > 40) idsCache.delete(idsCache.keys().next().value);
        if (k === mostrado) pontos(k);
      };
    }
    return idsCache.get(k);
  }

  function capa() {
    const w = meta.largura, h = meta.altura;
    const s = Math.max(tela.width / w, tela.height / h);
    return { s, x: (tela.width - w * s) / 2, y: (tela.height - h * s) / 2 };
  }

  const progresso = () => scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
  let atual = -1, mostrado = -1, pos = null, desenhado = '', antes = performance.now();
  const carregado = (i, passo) => { for (let j = i; j >= 0 && j < N; j += passo) if (quadros[j].pronto) return j; return -1; };
  function desenhar(forcar) {
    const agora = performance.now(), dt = Math.min(0.1, (agora - antes) / 1000);
    antes = agora;
    // a rodinha rola aos saltos; o passeio segue macio, entre um quadro e outro
    const alvo = progresso() * (N - 1);
    pos = pos === null ? alvo : pos + (alvo - pos) * (1 - Math.exp(-dt * 8));
    if (Math.abs(alvo - pos) < 0.01) pos = alvo;
    const i = Math.round(pos);
    if (i !== atual) { atual = i; priorizar(i); proximo(); }
    // os dois quadros já carregados em volta da posição, misturados; muito longe um do outro, só o mais próximo
    let a = carregado(Math.floor(pos), -1), b = carregado(Math.ceil(pos), 1);
    if (a < 0 && b < 0) return;
    if (a < 0) a = b;
    if (b < 0) b = a;
    let mistura = b > a ? (pos - a) / (b - a) : 0;
    const buraco = b - a > 1 || a !== b && (pos < a || pos > b);
    if (b - a > 2) { if (mistura < 0.5) b = a; else a = b; mistura = 0; }
    const k = mistura < 0.5 ? a : b;
    const chave = `${a}|${b}|${mistura.toFixed(3)}`;
    if (chave === desenhado && !forcar && !$('[data-luzes]').checked) return;
    desenhado = chave;
    mostrado = k;
    const c = capa(), w = meta.largura * c.s, h = meta.altura * c.s;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(quadros[a].img, c.x, c.y, w, h);
    if (b !== a && mistura > 0.002) {
      ctx.globalAlpha = mistura;
      ctx.drawImage(quadros[b].img, c.x, c.y, w, h);
      ctx.globalAlpha = 1;
    }
    const l = $('[data-luzes]').checked ? luz(k) : null;
    if (l) {
      const t = performance.now() / 1000;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.05 * Math.sin(t * 17.9);
      ctx.drawImage(l, c.x, c.y, meta.largura * c.s, meta.altura * c.s);
    }
    const falta = buraco || Math.abs(k - i) > 1 ? ` (ainda não renderizado; mostrando o ${k + 1})` : '';
    info.textContent = `quadro ${i + 1} de ${N}${falta} · ${carregados}/${existe.size} carregados · ${pequena ? '960 px' : `${meta.largura} px`}`;
    pontos(k);
  }

  // pontos (ponto_*) e clicáveis projetados com a câmera do quadro — confere o camera.json
  const camera = new THREE.PerspectiveCamera(50, meta.largura / meta.altura, 0.01, 1000);
  const marcas = [...(cam.pontos || []).map((p) => ({ nome: p.nome, pos: p.pos })),
    ...(cam.clicaveis || []).map((c) => ({ nome: c.nome, pos: c.centro, indice: c.indice }))].map((p) => {
    const el = document.createElement('div');
    el.className = 'ponto';
    el.innerHTML = `<span>${p.nome}</span>`;
    document.body.appendChild(el);
    return { ...p, el, v: new THREE.Vector3() };
  });
  function pontos(k) {
    const ligado = $('[data-pontos]').checked;
    if (!ligado) { marcas.forEach((m) => { m.el.style.display = 'none'; }); return; }
    camera.matrixWorld.fromArray(cam.matrizes[k]);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    camera.fov = cam.fov[k];
    camera.updateProjectionMatrix();
    const c = capa(), dpr = tela.width / innerWidth, mapa = ids(k);
    for (const m of marcas) {
      let u, v;
      if (m.indice) {
        // clicável: no meio do que aparece dele no quadro (escondido atrás de uma parede, não aparece)
        const centro = mapa?.centros[m.indice];
        if (centro) [u, v] = centro;
      } else {
        m.v.fromArray(m.pos).project(camera);
        if (m.v.z < 1 && Math.abs(m.v.x) < 1.2 && Math.abs(m.v.y) < 1.2) [u, v] = [m.v.x * 0.5 + 0.5, -m.v.y * 0.5 + 0.5];
      }
      m.el.style.display = u === undefined ? 'none' : 'block';
      if (u !== undefined) m.el.style.transform = `translate(${(c.x + u * meta.largura * c.s) / dpr}px, ${(c.y + v * meta.altura * c.s) / dpr}px)`;
    }
  }

  function tamanho() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    tela.width = Math.round(innerWidth * dpr);
    tela.height = Math.round(innerHeight * dpr);
    desenhar(true);
  }
  addEventListener('resize', tamanho);
  $('[data-pontos]').addEventListener('change', () => desenhar(true));
  tamanho();

  const etiqueta = $('[data-etiqueta]');
  addEventListener('pointermove', (e) => {
    if (!meta.ids || !Object.keys(clic).length) return;
    const mapa = mostrado >= 0 ? ids(mostrado) : null;
    if (!mapa) return;
    const c = capa(), dpr = tela.width / innerWidth;
    const u = (e.clientX * dpr - c.x) / (meta.largura * c.s), v = (e.clientY * dpr - c.y) / (meta.altura * c.s);
    const x = Math.floor(u * mapa.w), y = Math.floor(v * mapa.h);
    const nomeObj = x >= 0 && y >= 0 && x < mapa.w && y < mapa.h ? clic[mapa.px[y * mapa.w + x]] : null;
    etiqueta.style.display = nomeObj ? 'block' : 'none';
    tela.style.cursor = nomeObj ? 'pointer' : '';
    if (nomeObj) { etiqueta.textContent = nomeObj; etiqueta.style.left = `${e.clientX}px`; etiqueta.style.top = `${e.clientY}px`; }
  });

  // as luzes tremulam mesmo parado
  // desenha a cada quadro da tela: segue a rolagem com suavidade e faz as luzes tremularem mesmo parado
  (function laco() { desenhar(false); requestAnimationFrame(laco); })();
}

iniciar();
