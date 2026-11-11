// GLSL da Mathom-house. Todos os shaders usam GLSL ES 3.0 (WebGL2).

export const sceneVert = /* glsl */ `
out vec2 vUv;
out float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Cena principal: imagem reprojetada em profundidade + vida (luzes, fogo, vegetação).
// O alfa de saída é a confiança do pixel (usada para fundir duas vistas vizinhas):
// baixa fora da imagem e nas bordas de profundidade esticadas quando a câmera se afasta.
// fxMap: R = bordas de profundidade, G = luz morna (resiste à noite), B = vegetação.
export const sceneFrag = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform sampler2D fxMap;
uniform float uTime;
uniform float uAway;        // 0 = câmera no ponto de vista da imagem, 1 = longe dele
uniform float uExposure;
uniform float uSway;
uniform float uAspect;      // largura/altura da imagem original
uniform vec4 uLights[28];   // x, y (uv), raio (em unidades de largura), intensidade extra
uniform int uLightCount;
uniform vec4 uFire;         // x, y, raio, ligado
uniform vec3 uGrade;        // multiplicador de cor da cena
uniform float uNight;
in vec2 vUv;
in float vDepth;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float flicker(float t, float s){
  float n = sin(t * 7.3 + s * 1.7) * 0.45 + sin(t * 13.7 + s * 3.1) * 0.3 + sin(t * 27.1 + s * 5.3) * 0.15;
  n += (noise(vec2(t * 3.0, s * 7.0)) - 0.5) * 0.6;
  return n;
}

void main() {
  vec2 uv = vUv;
  vec2 cuv = clamp(uv, 0.0, 1.0);
  vec4 fx = texture(fxMap, cuv);

  // Vegetação respira com o vento.
  float veg = fx.b * uSway;
  if (veg > 0.001) {
    float w = uTime * 0.9;
    vec2 sw = vec2(sin(w * 1.3 + uv.y * 38.0 + uv.x * 11.0) + 0.5 * sin(w * 2.3 + uv.x * 57.0),
                   0.6 * cos(w * 1.1 + uv.x * 31.0));
    sw *= 0.5 + noise(uv * 6.0 + w * 0.2);
    uv += sw * veg * 0.0011;
  }

  // Chamas da lareira.
  float fireM = 0.0;
  if (uFire.w > 0.5) {
    vec2 d = (uv - uFire.xy) * vec2(1.0, 1.0 / uAspect);
    fireM = smoothstep(uFire.z, uFire.z * 0.35, length(d));
    float n = noise(vec2(uv.x * 180.0, uv.y * 70.0 - uTime * 3.2));
    float n2 = noise(vec2(uv.x * 90.0 + 3.0, uv.y * 40.0 - uTime * 2.1));
    uv += vec2((n - 0.5) * 0.0028, -(n2) * 0.0035) * fireM;
  }

  vec3 col = texture(map, uv).rgb;

  // Luzes que tremulam (velas, lanternas, fogo).
  float glow = 0.0;
  for (int i = 0; i < 28; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    vec2 d = (cuv - L.xy) * vec2(1.0, 1.0 / uAspect);
    float f = exp(-dot(d, d) / (L.z * L.z * 2.6));
    glow += f * (0.07 + 0.09 * flicker(uTime, float(i) * 1.37) + L.w);
  }
  if (uFire.w > 0.5) {
    float fl = flicker(uTime * 1.3, 91.0);
    glow += fireM * (0.18 + 0.16 * fl);
    col += fireM * fireM * vec3(0.35, 0.12, 0.02) * (0.5 + 0.5 * fl);
  }
  col *= 1.0 + glow;
  col *= uGrade;

  // Noite: a casa escurece, as luzes continuam acesas.
  float nightAmt = uNight * (1.0 - fx.g * 0.85);
  if (nightAmt > 0.001) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 night = mix(vec3(l), col, 0.35) * vec3(0.32, 0.4, 0.62) * 0.55;
    night += col * clamp(glow * 3.0, 0.0, 1.0) * 1.1;
    col = mix(col, night, nightAmt);
  }

  // Além das bordas da imagem, a casa continua em penumbra.
  vec2 e = smoothstep(vec2(-0.15), vec2(0.0), vUv) * smoothstep(vec2(1.15), vec2(1.0), vUv);
  col *= mix(0.25, 1.0, e.x * e.y);

  // Confiança: plena dentro da imagem; na margem (espelhada, em penumbra) ainda vale mais
  // que um contorno esticado da outra vista.
  vec2 inside = smoothstep(vec2(-0.03), vec2(0.02), vUv) * smoothstep(vec2(1.03), vec2(0.98), vUv);
  float conf = mix(0.4 * e.x * e.y, 1.0, inside.x * inside.y) * (1.0 - fx.r * 0.97 * uAway);
  // textura esticada na tela (superfície vista de lado, ou a "cortina" entre perto e longe):
  // a imagem varia quase nada numa direção e normalmente na outra
  vec2 ddx = dFdx(vUv), ddy = dFdy(vUv);
  float la = length(ddx), lb = length(ddy);
  float aniso = max(la, lb) / max(min(la, lb), 1e-7);
  conf *= 1.0 - 0.95 * smoothstep(3.0, 9.0, aniso) * uAway;
  fragColor = vec4(col * uExposure, conf);
}`;

// Passeio em cenas: a mesma imagem viva, sem relevo; o alfa marca a abertura da passagem.
export const cineFrag = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform sampler2D fxMap;
uniform float uTime;
uniform sampler2D gateMap;  // abertura da passagem (porta, arco)
uniform float uGateOn;
uniform float uExposure;
uniform float uSway;
uniform float uAspect;      // largura/altura da imagem original
uniform vec4 uLights[28];   // x, y (uv), raio (em unidades de largura), intensidade extra
uniform int uLightCount;
uniform vec4 uFire;         // x, y, raio, ligado
uniform vec3 uGrade;        // multiplicador de cor da cena
uniform float uNight;
in vec2 vUv;
in float vDepth;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float flicker(float t, float s){
  float n = sin(t * 7.3 + s * 1.7) * 0.45 + sin(t * 13.7 + s * 3.1) * 0.3 + sin(t * 27.1 + s * 5.3) * 0.15;
  n += (noise(vec2(t * 3.0, s * 7.0)) - 0.5) * 0.6;
  return n;
}

void main() {
  vec2 uv = vUv;
  vec2 cuv = clamp(uv, 0.0, 1.0);
  vec4 fx = texture(fxMap, cuv);

  // Vegetação respira com o vento.
  float veg = fx.b * uSway;
  if (veg > 0.001) {
    float w = uTime * 0.9;
    vec2 sw = vec2(sin(w * 1.3 + uv.y * 38.0 + uv.x * 11.0) + 0.5 * sin(w * 2.3 + uv.x * 57.0),
                   0.6 * cos(w * 1.1 + uv.x * 31.0));
    sw *= 0.5 + noise(uv * 6.0 + w * 0.2);
    uv += sw * veg * 0.0011;
  }

  // Chamas da lareira.
  float fireM = 0.0;
  if (uFire.w > 0.5) {
    vec2 d = (uv - uFire.xy) * vec2(1.0, 1.0 / uAspect);
    fireM = smoothstep(uFire.z, uFire.z * 0.35, length(d));
    float n = noise(vec2(uv.x * 180.0, uv.y * 70.0 - uTime * 3.2));
    float n2 = noise(vec2(uv.x * 90.0 + 3.0, uv.y * 40.0 - uTime * 2.1));
    uv += vec2((n - 0.5) * 0.0028, -(n2) * 0.0035) * fireM;
  }

  vec3 col = texture(map, uv).rgb;

  // Luzes que tremulam (velas, lanternas, fogo).
  float glow = 0.0;
  for (int i = 0; i < 28; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    vec2 d = (cuv - L.xy) * vec2(1.0, 1.0 / uAspect);
    float f = exp(-dot(d, d) / (L.z * L.z * 2.6));
    glow += f * (0.07 + 0.09 * flicker(uTime, float(i) * 1.37) + L.w);
  }
  if (uFire.w > 0.5) {
    float fl = flicker(uTime * 1.3, 91.0);
    glow += fireM * (0.18 + 0.16 * fl);
    col += fireM * fireM * vec3(0.35, 0.12, 0.02) * (0.5 + 0.5 * fl);
  }
  col *= 1.0 + glow;
  col *= uGrade;

  // Noite: a casa escurece, as luzes continuam acesas.
  float nightAmt = uNight * (1.0 - fx.g * 0.85);
  if (nightAmt > 0.001) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 night = mix(vec3(l), col, 0.35) * vec3(0.32, 0.4, 0.62) * 0.55;
    night += col * clamp(glow * 3.0, 0.0, 1.0) * 1.1;
    col = mix(col, night, nightAmt);
  }

  // Além das bordas da imagem, a casa continua em penumbra.
  vec2 e = smoothstep(vec2(-0.15), vec2(0.0), vUv) * smoothstep(vec2(1.15), vec2(1.0), vUv);
  col *= mix(0.25, 1.0, e.x * e.y);

  // alfa: 0 fora da imagem (fundo limpo), 0.5..1 dentro; 0.5 = abertura da passagem
  float gate = uGateOn > 0.5 ? texture(gateMap, cuv).r : 0.0;
  fragColor = vec4(col * uExposure, 1.0 - 0.5 * gate);
}`;

// Troca de cena: B aparece primeiro pela abertura de A (porta, arco) e depois, num instante
// breve, no lugar do resto de A. Onde uma das duas não tem imagem, vale a outra.
export const cineComposeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uGate;   // B pela abertura de A (0..1)
uniform float uFade;   // B no lugar de A (0..1)
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 a = texture(tA, vUv), b = texture(tB, vUv);
  float validA = step(0.25, a.a);
  float open = clamp((1.0 - a.a) * 2.0, 0.0, 1.0) * validA;
  float wb = b.a * mix(1.0, max(open * uGate, uFade), validA);
  fragColor = vec4(mix(a.rgb, b.rgb, wb), 1.0);
}`;


// Partículas (poeira em feixes de luz, brasas, pólen, vaga-lumes).
export const particleVert = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uDrift;       // velocidade média
uniform float uTurb;
uniform float uMode;       // 0 poeira, 1 brasa, 2 vaga-lume, 3 ave
attribute vec4 seed;
out float vAlpha;
out float vSeed;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main() {
  vec3 p = seed.xyz;
  float s = seed.w;
  vec3 drift = uDrift * (0.6 + 0.8 * hash(s * 3.1));
  vec3 q = p + drift * uTime;
  q += uTurb * vec3(sin(uTime * 0.37 + s * 11.0), sin(uTime * 0.29 + s * 7.0) * 0.6, cos(uTime * 0.33 + s * 5.0));
  q = uBoxMin + mod(q - uBoxMin, uBoxSize);
  vec3 f = (q - uBoxMin) / uBoxSize;
  float edge = smoothstep(0.0, 0.12, f.x) * smoothstep(1.0, 0.88, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.88, f.y)
             * smoothstep(0.0, 0.1, f.z) * smoothstep(1.0, 0.9, f.z);
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.3 + 2.0 * hash(s)) + s * 20.0);
  if (uMode > 0.5 && uMode < 1.5) tw = smoothstep(1.0, 0.6, f.y) * (0.6 + 0.4 * sin(uTime * 9.0 + s * 30.0));
  if (uMode > 1.5 && uMode < 2.5) tw = pow(max(0.0, sin(uTime * 0.9 + s * 17.0)), 3.0);
  vAlpha = edge * tw;
  vSeed = s;
  gl_PointSize = uSize * uPixelRatio * (0.5 + hash(s * 7.7)) / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const particleFrag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uMode;
in float vAlpha;
in float vSeed;
out vec4 fragColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  if (uMode > 2.5) {
    // ave ao longe: duas asas finas batendo devagar
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float k = 0.12 + 0.42 * sin(uTime * (4.5 + fract(vSeed) * 2.0) + vSeed * 10.0);
    float wy = -abs(p.x) * k + 0.08 + 0.12 * p.x * p.x;
    a = smoothstep(0.11, 0.0, abs(p.y - wy)) * (1.0 - smoothstep(0.6, 0.85, abs(p.x)));
    fragColor = vec4(uColor * a * vAlpha * uOpacity, a * vAlpha * uOpacity);
    return;
  }
  a *= a;
  fragColor = vec4(uColor * a * vAlpha * uOpacity, 0.0);
}`;

// ------------------------------------------------------------------ pós-processamento
export const fullscreenVert = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Downsample de 13 amostras (estilo "Call of Duty"), com limiar opcional para o bloom.
export const downFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;   // < 0 desliga
uniform float uKnee;
in vec2 vUv;
out vec4 fragColor;
vec3 s(vec2 o){ return texture(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (uThreshold >= 0.0) {
    float br = max(col.r, max(col.g, col.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    rq = rq * rq / (4.0 * uKnee + 1e-4);
    col *= max(rq, br - uThreshold) / max(br, 1e-4);
  }
  fragColor = vec4(col, 1.0);
}`;

// Fusão de duas vistas: cada uma pesa pelo avanço da travessia e pela própria confiança.
export const composeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 a = texture(tA, vUv), b = texture(tB, vUv);
  float wa = (1.0 - uMix) * (0.03 + a.a * a.a);
  float wb = uMix * (0.03 + b.a * b.a);
  float w = max(wa + wb, 1e-5);
  vec3 col = (a.rgb * wa + b.rgb * wb) / w;
  // onde nenhuma das duas sabe o que há (contornos esticados ao passar por uma porta),
  // a borda da tela fica na penumbra, como a sombra de um batente; no centro, não
  // (ali estão janelas e molduras, que escurecidas virariam manchas)
  float conf = (a.a * wa + b.a * wb) / w;
  float edge = smoothstep(0.2, 0.44, length((vUv - 0.5) * vec2(1.0, 0.8)));
  col *= mix(1.0, mix(0.16, 1.0, smoothstep(0.08, 0.5, conf)), edge);
  fragColor = vec4(col, 1.0);
}`;

export const upFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 c = texture(tSrc, vUv).rgb * 4.0;
  c += (texture(tSrc, vUv + vec2(-o.x, 0)).rgb + texture(tSrc, vUv + vec2(o.x, 0)).rgb
      + texture(tSrc, vUv + vec2(0, -o.y)).rgb + texture(tSrc, vUv + vec2(0, o.y)).rgb) * 2.0;
  c += texture(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture(tSrc, vUv + vec2(o.x, -o.y)).rgb
     + texture(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture(tSrc, vUv + vec2(o.x, o.y)).rgb;
  fragColor = vec4(texture(tBase, vUv).rgb + c / 16.0, 1.0);
}`;

export const finalFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tBlur1;
uniform sampler2D tBlur2;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uExposure;
uniform float uVignette;
uniform float uVigScale;    // > 1 = túnel (a luz se fecha em volta do centro)
uniform vec2 uVigCenter;
uniform float uGrain;
uniform vec2 uFoe;          // foco de expansão do movimento (uv)
uniform float uMotion;      // intensidade do desfoque radial
uniform vec3 uFocus;        // x, y (uv), raio do foco nítido
uniform float uDof;         // 0..1 força do desfoque fora do foco
uniform vec4 uFade;         // rgb, quantidade
uniform float uSaturation;
uniform vec3 uTint;
uniform float uAberration;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 shoulder(vec3 x){
  vec3 k = vec3(0.9);
  return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
}
vec3 toSRGB(vec3 c){
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  vec2 fromC = uv - 0.5;
  float ab = uAberration * (0.6 + uMotion * 6.0);
  // Desfoque radial de movimento (sensação de deslocamento).
  vec3 col;
  if (uMotion > 0.0005) {
    vec2 dir = (uv - uFoe) * uMotion;
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int i = 0; i < 12; i++) {
      float f = float(i) / 11.0;
      float w = 1.0 - f * 0.6;
      vec2 o = uv - dir * f;
      acc += vec3(texture(tScene, o + fromC * ab).r, texture(tScene, o).g, texture(tScene, o - fromC * ab).b) * w;
      wsum += w;
    }
    col = acc / wsum;
  } else {
    col = vec3(texture(tScene, uv + fromC * ab).r, texture(tScene, uv).g, texture(tScene, uv - fromC * ab).b);
  }

  // Profundidade de campo "de lente": nítido perto do foco, macio longe.
  if (uDof > 0.001) {
    vec2 d = (uv - uFocus.xy) * vec2(uRes.x / uRes.y, 1.0);
    float coc = smoothstep(uFocus.z, uFocus.z * 2.6 + 0.15, length(d)) * uDof;
    vec3 b1 = texture(tBlur1, uv).rgb;
    vec3 b2 = texture(tBlur2, uv).rgb;
    col = mix(col, b1, smoothstep(0.0, 0.5, coc));
    col = mix(col, b2, smoothstep(0.45, 1.0, coc));
  }

  col += texture(tBloom, uv).rgb * (uBloom * 0.2);
  col *= uExposure;

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation) * uTint;
  col = shoulder(col);

  float v = smoothstep(0.95, 0.25, length((uv - uVigCenter) * vec2(uRes.x / uRes.y * 0.72, 1.0)) * uVigScale);
  col *= mix(1.0 - uVignette, 1.0, v);
  col = mix(col, uFade.rgb, uFade.a);

  col = toSRGB(col);
  float g = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain * (1.0 - abs(l - 0.5));
  fragColor = vec4(col, 1.0);
}`;
