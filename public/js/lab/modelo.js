// Laboratório: a toca em 3D de verdade, desenhada em tempo real a partir do .glb exportado
// do Blender (tools/blender/exportar_glb.py). A rolagem leva a câmera pelo passeio — a câmera
// animada do .blend, ou o caminho entre as câmeras cam_01, cam_02… —; arrastar olha em volta;
// o modo livre anda pela casa com o teclado ou a rodinha.
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/addons/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/addons/DRACOLoader.js';
import { HDRLoader } from '../../vendor/addons/HDRLoader.js';
import { RoomEnvironment } from '../../vendor/addons/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from '../../vendor/addons/RectAreaLightUniformsLib.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const ARQUIVO = params.get('arquivo') || 'assets/modelo/toca.glb';
const CEU = params.get('ceu') || ARQUIVO.replace(/\.glb$/i, '-ceu.hdr');
const SUAVIZAR = !params.has('sem-suavizar');    // (para testes: a câmera vai direto ao ponto da rolagem)
const QUADROS = 300, FPS = 30, PAUSA = 0.35;    // os mesmos do render_passeio.py (câmeras cam_XX)
// O navegador não tem a luz rebatida do Cycles nem a sombra das lanternas: cada grupo de luz entra com
// um peso, calibrado comparando com o render do Cycles da Mathom-house. A luz ambiente (o céu refletido)
// vai de "dentro" a "fora" conforme quanto céu a câmera vê naquele ponto do passeio.
const PESO = { pontos: 0.2, areas: 0.5, sol: 1.5, dentro: 0.03, fora: 1 };
const NOME_CAM = /^cam[_\-. ]?(\d+)$/i;
const UP = new THREE.Vector3(0, 1, 0);

const tela = $('#tela');
const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;       // o mesmo do Blender
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;             // o sol não se move: as sombras só são refeitas quando a porta mexe
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0705);
const pmrem = new THREE.PMREMGenerator(renderer);
const luzesBase = new Map(), chamas = [], sois = [];
const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 500);
if (params.has('depurar')) window.depurar = { THREE, scene, renderer, luzesBase, camera };

function aviso(html) {
  const el = $('[data-aviso]');
  el.innerHTML = `<div>${html}</div>`;
  el.hidden = false;
}

// Se o servidor bloquear algo de que o carregador precisa (política de segurança, CSP), avisa em vez de
// ficar na tela preta.
addEventListener('securitypolicyviolation', (e) => {
  if (info.base) return;
  aviso(`O servidor bloqueou <code>${e.blockedURI || e.violatedDirective}</code> (${e.violatedDirective}).<br><br>
    O 3D precisa de <code>blob:</code> e de WebAssembly na política de segurança (Content-Security-Policy) — veja o
    <code>Caddyfile.template</code>.`);
});

// ─── luz assada no Blender (tools/blender: mapas de luz por cômodo e luz nos vértices) ───
// O mapa guarda a luz difusa do Cycles (direta + rebatida, com as sombras das lanternas) numa curva
// logarítmica. O shader desfaz a curva e usa essa luz: como luz difusa (no lugar das luzes em tempo real),
// como reflexo (um ambiente uniforme com a mesma luz: dá o brilho do latão e da madeira) e deixa de somar
// o céu como luz difusa (ele já está no mapa). As luzes em tempo real só iluminam o que não tem luz
// assada (a porta, que se move; vidros; chamas), sem sombras.
const uLuzVertices = { value: Math.PI };
function prepararShadersDaLuz(cod) {
  const C = THREE.ShaderChunk, f = (x) => Number(x).toFixed(6);
  const trocar = (chunk, de, para) => {
    if (!C[chunk].includes(de)) console.warn(`luz assada: trecho não encontrado em ${chunk}`);
    C[chunk] = C[chunk].replace(de, para);
  };
  C.lights_fragment_begin = `#if defined( LUZ_ASSADA ) || defined( LUZ_VERTICES )
	#undef RE_Direct
	#undef RE_Direct_RectArea
#endif
` + C.lights_fragment_begin;
  C.lightmap_pars_fragment += `
#ifdef LUZ_ASSADA
	vec3 luzDecodificar( vec3 v ) { return ${f(cod.k)} * ( exp2( v * ${f(Math.log2(1 + cod.maximo / cod.k))} ) - 1.0 ); }
#endif`;
  C.color_pars_vertex += '\n#ifdef LUZ_VERTICES\n\tattribute vec4 _luz;\n\tvarying vec3 vLuz;\n#endif';
  C.color_vertex += '\n#ifdef LUZ_VERTICES\n\tvLuz = _luz.rgb;\n#endif';
  C.color_pars_fragment += '\n#ifdef LUZ_VERTICES\n\tvarying vec3 vLuz;\n\tuniform float luzIntensidade;\n#endif';
  trocar('lights_fragment_maps', 'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;', `#ifdef LUZ_ASSADA
			vec3 lightMapIrradiance = luzDecodificar( lightMapTexel.rgb ) * lightMapIntensity;
		#else
			vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		#endif`);
  trocar('lights_fragment_maps', 'irradiance += lightMapIrradiance;', `irradiance += lightMapIrradiance;
		#if defined( LUZ_ASSADA ) && defined( RE_IndirectSpecular )
			radiance += lightMapIrradiance * RECIPROCAL_PI;
		#endif
	#endif
	#ifdef LUZ_VERTICES
		irradiance += vLuz * luzIntensidade;`);
  trocar('lights_fragment_maps', 'iblIrradiance += getIBLIrradiance( geometryNormal );', `#if !defined( LUZ_ASSADA ) && !defined( LUZ_VERTICES )
				iblIrradiance += getIBLIrradiance( geometryNormal );
			#endif`);
}

// Troca os materiais das malhas com luz assada. Devolve a lista {malha, dinamico, assado}.
function usarLuzAssada(raiz, cod) {
  const pasta = ARQUIVO.replace(/[^/]*$/, '') + (cod.pasta || 'luz') + '/';
  const texturas = new Map(), materiais = new Map(), trocas = [];
  const carregador = new THREE.TextureLoader();
  const mapa = (nome) => {
    if (!texturas.has(nome)) {
      const t = carregador.load(pasta + nome + '.png', () => { info.mapas = (info.mapas || 0) + 1; });
      t.flipY = false;                        // UV do glTF
      t.colorSpace = THREE.NoColorSpace;      // a curva é desfeita no shader
      t.channel = 1;                          // o segundo UV ("Luz")
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      texturas.set(nome, t);
    }
    return texturas.get(nome);
  };
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    const u = o.userData.luz_mapa || o.userData.luz_vertices ? o.userData : o.parent?.userData ?? {};
    const nomeMapa = u.luz_mapa, vertices = u.luz_vertices && o.geometry.attributes._luz;
    if (!nomeMapa && !vertices) return;
    if (nomeMapa && !o.geometry.attributes.uv1) return;
    const chave = `${o.material.uuid}|${nomeMapa || 'vertices'}`;
    if (!materiais.has(chave)) {
      const m = o.material.clone();
      if (nomeMapa) {
        m.lightMap = mapa(nomeMapa);
        m.lightMapIntensity = Math.PI;         // o Cycles guarda E/π; o three.js espera E
        m.defines = { ...m.defines, LUZ_ASSADA: '' };
      } else {
        m.defines = { ...m.defines, LUZ_VERTICES: '' };
        m.onBeforeCompile = (sh) => { sh.uniforms.luzIntensidade = uLuzVertices; };
      }
      materiais.set(chave, m);
    }
    trocas.push({ malha: o, dinamico: o.material, assado: materiais.get(chave) });
  });
  return { trocas, texturas };
}

// ─── o céu: foto 360° do World do Blender ───
// O sol pintado no céu vira uma luz de verdade (com sombra); o resto do céu ilumina de leve.
function prepararCeu(tex) {
  const { data, width: W, height: H } = tex.image;
  let media = 0;
  for (let i = 0; i < data.length; i += 4) media += data[i] + data[i + 1] + data[i + 2];
  media /= (data.length / 4) * 3;
  const limiar = Math.max(20, media * 20);
  const E = [0, 0, 0], dir = new THREE.Vector3(), v = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI;
    const dw = ((2 * Math.PI) / W) * (Math.PI / H) * Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (l <= limiar) continue;
      const lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      v.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      dir.addScaledVector(v, l * dw);
      for (let c = 0; c < 3; c++) { E[c] += data[i + c] * dw; data[i + c] *= limiar / l; }
    }
  }
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const forca = Math.max(...E);
  return { tex, sol: forca > 0.05 ? { dir: dir.normalize(), cor: new THREE.Color(E[0] / forca, E[1] / forca, E[2] / forca), forca } : null };
}
const ceuPronto = new HDRLoader().setDataType(THREE.FloatType).loadAsync(CEU).then(prepararCeu).catch(() => null);

// ─── o caminho entre câmeras cam_XX: a mesma curva do render_passeio.py ───
function catmull(p0, p1, p2, p3, u, out) {
  const u2 = u * u, u3 = u2 * u;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}
// campo de visão horizontal (o que a câmera do Blender enquadrava de lado a lado)
const horizontal = (fov, aspecto) => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspecto);

class Caminho {
  constructor(cams) {
    this.P = cams.map((c) => c.getWorldPosition(new THREE.Vector3()));
    const fwd = cams.map((c) => new THREE.Vector3(0, 0, -1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion())));
    const passos = this.P.slice(1).map((p, i) => p.distanceTo(this.P[i]));
    const alcance = Math.max(1.5, passos.reduce((a, b) => a + b, 0) / passos.length);
    this.L = this.P.map((p, i) => p.clone().addScaledVector(fwd[i], alcance));
    this.h = cams.map((c) => horizontal(c.fov || 50, c.aspect || 16 / 9));
    const peso = passos.map((d, i) => d + fwd[i].angleTo(fwd[i + 1]) + 0.05);
    const tot = peso.reduce((a, b) => a + b, 0);
    this.inicio = [0];
    for (const w of peso) this.inicio.push(this.inicio[this.inicio.length - 1] + (w / tot) * (QUADROS - 1));
  }

  em(q, pos, alvo) {
    const n = this.P.length;
    let i = 0;
    while (i < n - 2 && q >= this.inicio[i + 1]) i++;
    let u = THREE.MathUtils.clamp((q - this.inicio[i]) / (this.inicio[i + 1] - this.inicio[i]), 0, 1);
    u = u * (1 - PAUSA) + u * u * (3 - 2 * u) * PAUSA;
    const k = [Math.max(0, i - 1), i, i + 1, Math.min(n - 1, i + 2)];
    catmull(...k.map((j) => this.P[j]), u, pos);
    catmull(...k.map((j) => this.L[j]), u, alvo);
    return this.h[i] + (this.h[i + 1] - this.h[i]) * (u * u * (3 - 2 * u));
  }
}

// A câmera animada do .blend: a animação que mexe num nó de câmera.
function cameraAnimada(gltf) {
  for (const clip of gltf.animations) {
    for (const tr of clip.tracks) {
      const no = gltf.scene.getObjectByName(tr.name.slice(0, tr.name.lastIndexOf('.')));
      const cam = no && (no.isCamera ? no : no.children.find((c) => c.isCamera));
      if (cam) return { cam, clip, t0: Math.min(...clip.tracks.map((t) => t.times[0])), t1: clip.duration };
    }
  }
  return null;
}

// ─── luzes ───
function luzDeArea(no) {
  const u = no.userData;
  let w = u.area_largura, h = u.area_altura;
  const area = u.area_disco ? (Math.PI * w * h) / 4 : w * h;
  if (u.area_disco) { w *= Math.sqrt(Math.PI) / 2; h *= Math.sqrt(Math.PI) / 2; }   // quadrado de mesma área
  // potência do Blender (W) -> luminância da superfície. O Cycles faz a luz de área brilhar de frente
  // como uma luz pontual de mesma potência: P / (4π · área)
  const luz = new THREE.RectAreaLight(new THREE.Color().fromArray(u.area_cor), u.area_energia / (4 * Math.PI * area), w, h);
  no.getWorldPosition(luz.position);
  luz.lookAt(luz.position.clone().add(new THREE.Vector3().fromArray(u.area_dir)));
  luz.name = no.name;
  scene.add(luz);
  luzesBase.set(luz, luz.intensity * PESO.areas);
}

// Um sol com sombra, cobrindo a área do passeio.
function sol(cor, forca, paraOSol, caixa, mapa) {
  const luz = new THREE.DirectionalLight(cor, forca);
  const esfera = caixa.getBoundingSphere(new THREE.Sphere());
  luz.target.position.copy(esfera.center);
  luz.position.copy(esfera.center).addScaledVector(paraOSol, esfera.radius * 2);
  luz.castShadow = true;
  luz.shadow.mapSize.set(mapa, mapa);
  luz.shadow.bias = -0.0003;
  luz.shadow.normalBias = 0.03;
  const c = luz.shadow.camera;
  c.left = c.bottom = -esfera.radius;
  c.right = c.top = esfera.radius;
  c.near = 0.1;
  c.far = esfera.radius * 4;
  c.updateProjectionMatrix();
  scene.add(luz, luz.target);
  luzesBase.set(luz, forca * PESO.sol);
  sois.push(luz);
}

// ─── carregar ───
const draco = new DRACOLoader().setDecoderPath('vendor/addons/libs/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
let raiz = null, caminho = null, animada = null, mixer = null, assada = null;
const acoes = [], cams = [], clicaveis = [], pontos = [], chamasMat = [];
const info = { base: '' };

// Liga/desliga a luz assada. Com ela, as sombras em tempo real saem (já estão nos mapas).
function modoAssado(on) {
  if (!assada) return;
  for (const t of assada.trocas) t.malha.material = on ? t.assado : t.dinamico;
  renderer.shadowMap.enabled = !on && $('[data-sombras]').checked;
  renderer.shadowMap.needsUpdate = true;
  $('[data-sombras]').disabled = on;
}

// No Blender, uma luz pode iluminar sem aparecer nos reflexos (Ray Visibility → Glossy desligado),
// como as luzes de área da Mathom-house. O three.js não tem essa opção: o reflexo é tirado do shader.
function luzesDeAreaSemReflexo() {
  const trecho = 'reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );';
  THREE.ShaderChunk.lights_physical_pars_fragment = THREE.ShaderChunk.lights_physical_pars_fragment.replace(trecho, '');
}

loader.load(ARQUIVO, async (gltf) => {
  raiz = gltf.scene;
  const semReflexo = [];
  raiz.traverse((o) => { if (o.userData.area_dir) semReflexo.push(!o.userData.area_reflexo); });
  if (semReflexo.length && semReflexo.every(Boolean)) luzesDeAreaSemReflexo();
  scene.add(raiz);
  raiz.updateMatrixWorld(true);
  let tri = 0;
  const caixa = new THREE.Box3(), areas = [];
  raiz.traverse((o) => {
    const m = NOME_CAM.exec(o.name);
    if (m && (o.isCamera || o.children.some((c) => c.isCamera))) cams.push({ n: +m[1], obj: o.isCamera ? o : o.children.find((x) => x.isCamera) });
    if (o.isCamera) caixa.expandByPoint(o.getWorldPosition(new THREE.Vector3()));
    if (o.isMesh) {
      tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      o.castShadow = o.receiveShadow = true;
      // vidro: transparente simples (a transmissão de verdade redesenha a cena inteira a cada quadro)
      if (o.material.transmission > 0) {
        o.material.transmission = 0;
        o.material.transparent = true;
        o.material.opacity = 0.18;
        o.material.depthWrite = false;
      }
    }
    if (o.isMesh && o.material.emissiveIntensity > 0 && o.material.emissive?.getHex() && !chamasMat.some((c) => c.mat === o.material)) {
      chamasMat.push({ mat: o.material, base: o.material.emissiveIntensity, fase: Math.random() * 100 });
    }
    if (/^clique_/i.test(o.name)) clicaveis.push(o);
    if (/^ponto_/i.test(o.name)) pontos.push(o);
    if (o.userData.area_dir) areas.push(o);
    if (o.isLight) {
      luzesBase.set(o, o.intensity * (o.isPointLight || o.isSpotLight ? PESO.pontos : 1));
      if (o.isPointLight || o.isSpotLight) chamas.push({ luz: o, fase: Math.random() * 100 });
    }
  });
  areas.forEach(luzDeArea);

  // o passeio: a câmera animada do .blend ou o caminho entre cam_01, cam_02…
  animada = cameraAnimada(gltf);
  cams.sort((a, b) => a.n - b.n);
  if (!animada && cams.length >= 2) caminho = new Caminho(cams.map((c) => c.obj));
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(raiz);
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      a.play();
      acoes.push(a);
    }
  }

  // exposição e tom do Blender
  const extras = raiz.userData;
  if (typeof extras.exposicao === 'number') $('[data-exposicao]').value = (2 ** extras.exposicao).toFixed(2);
  if (/standard/i.test(extras.transformacao || '')) renderer.toneMapping = THREE.NoToneMapping;
  else if (/neutral/i.test(extras.transformacao || '')) renderer.toneMapping = THREE.NeutralToneMapping;

  // céu e sóis (com sombra) sobre a área do passeio
  if (caixa.isEmpty()) caixa.setFromObject(raiz);
  caixa.expandByVector(new THREE.Vector3(7, 0, 7));
  caixa.min.y -= 1;
  caixa.max.y += 6;
  const foto = await ceuPronto;
  if (foto) {
    scene.background = foto.tex;
    scene.environment = pmrem.fromEquirectangular(foto.tex).texture;
    if (foto.sol) sol(foto.sol.cor, foto.sol.forca, foto.sol.dir, caixa, 4096);
  } else {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  const doBlend = [];
  raiz.traverse((o) => { if (o.isDirectionalLight) doBlend.push(o); });
  for (const o of doBlend) {
    // o sol do .blend: trocado por um igual, com sombra
    const paraOSol = o.getWorldPosition(new THREE.Vector3()).sub(o.target.getWorldPosition(new THREE.Vector3())).normalize();
    sol(o.color, o.intensity, paraOSol, caixa, 2048);
    o.visible = false;
    luzesBase.delete(o);
  }
  renderer.shadowMap.needsUpdate = true;

  for (const c of clicaveis) c.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.userData.emissivo = o.material.emissive?.clone(); } });

  // luz assada no Blender, se o modelo tiver
  const cod = extras.luz_codificacao;
  if (cod && cod.tipo === 'log2') {
    prepararShadersDaLuz(cod);
    assada = usarLuzAssada(raiz, cod);
    if (!assada.trocas.length) assada = null;
  }
  $('[data-assada-rotulo]').hidden = !assada;
  modoAssado(!!assada && $('[data-assada]').checked);
  preparaEscolha();
  marcadores();
  info.base = `${Math.round(tri).toLocaleString('pt-BR')} triângulos · ${animada ? `câmera animada (${Math.round(animada.t1 - animada.t0)} s)` : `${cams.length} câmeras`}`
    + ` · ${clicaveis.length} clicáveis`
    + (assada ? ` · luz assada (${assada.texturas.size} mapas, ${assada.trocas.length} malhas)` : ` · ${areas.length} luzes de área`)
    + (foto ? ' · céu 360°' : '');
  $('[data-barra]').style.width = '100%';
  if (!animada && !caminho) { livre.ativar(); $('[data-dica]').textContent = 'Sem câmera animada nem câmeras cam_01, cam_02… no modelo: modo livre.'; }
}, (e) => {
  if (e.total) $('[data-barra]').style.width = `${(e.loaded / e.total) * 100}%`;
  $('[data-info]').textContent = `carregando ${(e.loaded / 1e6).toFixed(1)} MB…`;
}, () => {
  aviso(`Não achei <code>${ARQUIVO}</code>.<br><br>Exporte com <code>tools/blender/exportar_glb.py</code> e copie o arquivo para
    <code>assets/modelo/toca.glb</code> (ou abra esta página com <code>?arquivo=caminho/do/arquivo.glb</code>).`);
});

// ─── olhar em volta: arrastar "segura" a imagem, como nas fotos 360° ───
// (arrastar para a direita traz o que está à esquerda)
const olhar = { yaw: 0, pitch: 0 };
let arrastando = null;
tela.addEventListener('pointerdown', (e) => { arrastando = { x: e.clientX, y: e.clientY, yaw: olhar.yaw, pitch: olhar.pitch }; tela.setPointerCapture(e.pointerId); });
tela.addEventListener('pointermove', (e) => {
  if (!arrastando) return;
  // o ponto segurado acompanha o mouse: ângulo por pixel = campo de visão / altura da tela
  const k = THREE.MathUtils.degToRad(camera.fov) / innerHeight;
  olhar.yaw = arrastando.yaw + (e.clientX - arrastando.x) * k;
  olhar.pitch = THREE.MathUtils.clamp(arrastando.pitch + (e.clientY - arrastando.y) * k, -1.2, 1.2);
});
const soltar = () => { arrastando = null; };
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);
tela.addEventListener('dblclick', () => { olhar.yaw = olhar.pitch = 0; });

// ─── modo livre (teclado e rodinha) ───
const teclas = new Set();
addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if (e.key.toLowerCase() === 'l') livre.alternar();
  teclas.add(e.key.toLowerCase());
  if (livre.on && ['arrowup', 'arrowdown', ' '].includes(e.key.toLowerCase())) e.preventDefault();
});
addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
// a rodinha (ou o touchpad) anda para onde se olha: cada "clique" (~100 px) vale uns 40 cm
addEventListener('wheel', (e) => {
  if (!livre.on) return;
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  livre.passos = THREE.MathUtils.clamp(livre.passos - px * 0.004, -3, 3);
}, { passive: false });
const livre = {
  on: false,
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, passos: 0,
  ativar() {
    this.on = true;
    this.passos = 0;
    this.pos.copy(camera.position);
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    this.yaw = Math.atan2(-f.x, -f.z); this.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    olhar.yaw = olhar.pitch = 0;
    document.body.style.overflow = 'hidden';
    $('[data-livre]').textContent = 'Voltar ao passeio (L)';
    $('[data-dica]').textContent = 'Rodinha, WASD ou setas andam para onde você olha · Q/E descem e sobem · Shift corre · arraste para olhar.';
  },
  alternar() {
    if (this.on) {
      this.on = false;
      olhar.yaw = olhar.pitch = 0;
      document.body.style.overflow = '';
      $('[data-livre]').textContent = 'Caminhar livre (L)';
      $('[data-dica]').textContent = 'Role para andar · arraste a imagem para olhar em volta · duplo clique volta a olhar para a frente.';
    } else this.ativar();
  },
};
$('[data-livre]').addEventListener('click', () => livre.alternar());

// ─── controles ───
const valor = (s) => parseFloat($(s).value);
$('[data-qualidade]').addEventListener('input', tamanho);
$('[data-auto]').addEventListener('change', tamanho);
$('[data-assada]').addEventListener('change', (e) => modoAssado(e.target.checked));
$('[data-sombras]').addEventListener('change', (e) => {
  renderer.shadowMap.enabled = e.target.checked;
  renderer.shadowMap.needsUpdate = true;
  scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; });
});

// ─── posição conforme a rolagem ───
const pos = new THREE.Vector3(), alvo = new THREE.Vector3(), escala = new THREE.Vector3();
let hfov = THREE.MathUtils.degToRad(60), suave = null;
const tempos = new Map();
function progresso() { return scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight); }

// Põe todas as animações (câmera e porta) no mesmo instante t, como na linha do tempo do Blender.
function animarAte(t) {
  if (!mixer) return;
  for (const a of acoes) {
    const ta = Math.min(t, a.getClip().duration);
    // algo além da câmera mexeu (a porta): as sombras precisam ser refeitas
    if (tempos.get(a) !== ta && a.getClip() !== animada?.clip) renderer.shadowMap.needsUpdate = true;
    tempos.set(a, ta);
    a.time = ta;
  }
  mixer.update(0);
}

// quanto céu a câmera vê (0 a 1), amostrado pelo exportador ao longo do passeio
let ceu = 1;
function ceuVisivel(p) {
  const v = (animada?.cam ?? cams[0]?.obj)?.userData.ceu_visivel;
  if (!v?.length) return 1;
  const x = THREE.MathUtils.clamp(p, 0, 1) * (v.length - 1), i = Math.min(Math.floor(x), v.length - 2);
  return v[i] + (v[i + 1] - v[i]) * (x - i);
}

function posicionar(p) {
  ceu = ceuVisivel(p);
  if (animada) {
    animarAte(animada.t0 + p * (animada.t1 - animada.t0));
    animada.cam.updateWorldMatrix(true, false);
    animada.cam.matrixWorld.decompose(camera.position, camera.quaternion, escala);
    hfov = horizontal(animada.cam.fov, animada.cam.aspect);
  } else if (caminho) {
    const q = p * (QUADROS - 1);
    hfov = caminho.em(q, pos, alvo);
    animarAte((q + 1) / FPS);
    camera.position.copy(pos);
    camera.up.copy(UP);
    camera.lookAt(alvo);
  }
}

// qualidade automática: se os quadros por segundo caírem, a resolução baixa (e volta a subir quando sobra)
let auto = 1;
const medida = { desde: performance.now(), quadros: 0 };
function qualidadeAutomatica(agora) {
  medida.quadros++;
  const passou = (agora - medida.desde) / 1000;
  if (passou < 2) return;
  const fpsReal = medida.quadros / passou;
  medida.desde = agora;
  medida.quadros = 0;
  if (!$('[data-auto]').checked || document.hidden) return;
  const antes = auto;
  if (fpsReal < 30 && auto > 0.5) auto = Math.max(0.5, auto - 0.15);
  else if (fpsReal > 55 && auto < 1) auto = Math.min(1, auto + 0.1);
  if (auto !== antes) tamanho();
}

function tamanho() {
  const q = valor('[data-qualidade]') * ($('[data-auto]').checked ? auto : 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * q);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', tamanho);
tamanho();

// ─── clicáveis: a escolha é feita pela GPU (um pixel desenhado com a cor-código de cada objeto) ───
const etiqueta = $('[data-etiqueta]');
const mouse = { x: -1, y: -1, mexeu: false };
const alvoEscolha = new THREE.WebGLRenderTarget(1, 1);
const pixel = new Uint8Array(4);
const preto = new THREE.MeshBasicMaterial({ color: 0x000000 });
let acesso = null, ultimaEscolha = 0;
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.mexeu = true;
  etiqueta.style.left = `${e.clientX}px`; etiqueta.style.top = `${e.clientY}px`;
});
function preparaEscolha() {
  clicaveis.forEach((c, i) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((i + 1) / 255, 0, 0, THREE.LinearSRGBColorSpace) });
    c.traverse((o) => { if (o.isMesh) o.userData.escolha = m; });
  });
}
function clicavelSobMouse() {
  if (!clicaveis.length || arrastando || mouse.x < 0) return null;
  const guardados = [];
  raiz.traverse((o) => { if (o.isMesh) { guardados.push([o, o.material]); o.material = o.userData.escolha || preto; } });
  const fundo = scene.background;
  scene.background = null;
  camera.setViewOffset(innerWidth, innerHeight, mouse.x, mouse.y, 1, 1);
  renderer.setRenderTarget(alvoEscolha);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(alvoEscolha, 0, 0, 1, 1, pixel);
  renderer.setRenderTarget(null);
  camera.clearViewOffset();
  scene.background = fundo;
  for (const [o, m] of guardados) o.material = m;
  return clicaveis[pixel[0] - 1] || null;
}
function acender(o, on) {
  o.traverse((m) => { if (m.isMesh && m.userData.emissivo) m.material.emissive.copy(on ? new THREE.Color(0x553311) : m.userData.emissivo); });
}
const nomeBonito = (o) => o.name.replace(/^clique_/i, '').replace(/_/g, ' ').replace(/ \d+$/, '');

// ─── pontos para textos ───
const marcas = [];
function marcadores() {
  for (const p of pontos) {
    const el = document.createElement('div');
    el.className = 'ponto';
    el.innerHTML = `<span>${p.name}</span>`;
    document.body.appendChild(el);
    marcas.push({ obj: p, el });
  }
}

// ─── laço ───
const relogio = new THREE.Timer();
let fps = 60;
const tmp = new THREE.Vector3(), ultimaPose = new THREE.Matrix4();
function quadro(agora) {
  relogio.update(agora);
  const dt = Math.min(0.05, relogio.getDelta());
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  renderer.toneMappingExposure = valor('[data-exposicao]');
  scene.environmentIntensity = valor('[data-ambiente]') * (PESO.dentro + (PESO.fora - PESO.dentro) * ceu);
  const t = relogio.getElapsed(), chamasOn = $('[data-chamas]').checked;
  for (const [luz, base] of luzesBase) luz.intensity = base * valor('[data-luzes]');
  if (assada) {
    uLuzVertices.value = Math.PI * valor('[data-luzes]');
    for (const tr of assada.trocas) if (tr.assado.lightMap) tr.assado.lightMapIntensity = Math.PI * valor('[data-luzes]');
  }
  const tremor = (fase) => Math.sin(t * 7.3 + fase) * 0.45 + Math.sin(t * 13.7 + fase * 3.1) * 0.3 + Math.sin(t * 27.1 + fase * 5.3) * 0.15;
  if (chamasOn) for (const c of chamas) c.luz.intensity *= 1 + 0.12 * tremor(c.fase);
  for (const c of chamasMat) c.mat.emissiveIntensity = c.base * (chamasOn ? 1 + 0.25 * tremor(c.fase) : 1);
  qualidadeAutomatica(agora);

  if (livre.on) {
    const v = (teclas.has('shift') ? 4 : 1.4) * dt;
    const yaw = livre.yaw + olhar.yaw;          // anda para onde se olha (incluindo o que se arrastou)
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    // o passo pedido pela rodinha é percorrido com suavidade
    const passo = livre.passos * (1 - Math.exp(-dt * 8));
    livre.passos -= passo;
    livre.pos.addScaledVector(f, passo);
    if (teclas.has('w') || teclas.has('arrowup')) livre.pos.addScaledVector(f, v);
    if (teclas.has('s') || teclas.has('arrowdown')) livre.pos.addScaledVector(f, -v);
    if (teclas.has('d') || teclas.has('arrowright')) livre.pos.addScaledVector(r, v);
    if (teclas.has('a') || teclas.has('arrowleft')) livre.pos.addScaledVector(r, -v);
    if (teclas.has('e')) livre.pos.y += v;
    if (teclas.has('q')) livre.pos.y -= v;
    camera.position.copy(livre.pos);
    camera.rotation.set(THREE.MathUtils.clamp(livre.pitch + olhar.pitch, -1.5, 1.5), livre.yaw + olhar.yaw, 0, 'YXZ');
  } else if (animada || caminho) {
    // a rodinha rola aos saltos; a câmera segue macia
    const p = progresso(), anterior = suave;
    suave = suave === null || !SUAVIZAR ? p : suave + (p - suave) * (1 - Math.exp(-dt * 7));
    posicionar(suave);
    // ao voltar a andar, a vista retorna devagar para a frente (como virar a cabeça de volta)
    if (!arrastando && anterior !== null && Math.abs(suave - anterior) > 1e-5 && (olhar.yaw || olhar.pitch)) {
      olhar.yaw = Math.atan2(Math.sin(olhar.yaw), Math.cos(olhar.yaw));   // pelo lado mais curto
      const k = Math.exp(-dt * 3);
      olhar.yaw *= k;
      olhar.pitch *= k;
      if (Math.abs(olhar.yaw) + Math.abs(olhar.pitch) < 2e-3) olhar.yaw = olhar.pitch = 0;
    }
    if (olhar.yaw || olhar.pitch) {
      camera.rotateOnWorldAxis(UP, olhar.yaw);
      camera.rotateX(olhar.pitch);
    }
  }
  // mesmo enquadramento horizontal do Blender; em telas em pé, sem fechar demais
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / Math.max(camera.aspect, 0.75)));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // clicável sob o mouse: quando o mouse ou a câmera mexem, no máximo ~12 vezes por segundo
  if (raiz && (mouse.mexeu || !ultimaPose.equals(camera.matrixWorld)) && agora - ultimaEscolha > 80) {
    ultimaEscolha = agora;
    mouse.mexeu = false;
    ultimaPose.copy(camera.matrixWorld);
    const alvoClique = clicavelSobMouse();
    if (alvoClique !== acesso) {
      if (acesso) acender(acesso, false);
      if (alvoClique) acender(alvoClique, true);
      acesso = alvoClique;
      etiqueta.style.display = acesso ? 'block' : 'none';
      etiqueta.textContent = acesso ? nomeBonito(acesso) : '';
      tela.style.cursor = acesso ? 'pointer' : '';
    }
  }
  const mostrar = $('[data-pontos]').checked;
  for (const m of marcas) {
    m.obj.getWorldPosition(tmp).project(camera);
    const vis = mostrar && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    m.el.style.display = vis ? 'block' : 'none';
    if (vis) m.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
  }

  renderer.render(scene, camera);
  const inf = renderer.info;
  if (info.base) {
    $('[data-info]').textContent = info.base;
    $('[data-stats]').textContent = `${fps.toFixed(0)} fps · ${inf.render.calls} chamadas · ${inf.render.triangles.toLocaleString('pt-BR')} triângulos na tela · ${inf.memory.textures} texturas`
      + ($('[data-auto]').checked && auto < 1 ? ` · resolução ${Math.round(auto * 100)}%` : '');
  }
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);
