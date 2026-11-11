// O roteiro do passeio em frames (frames.html): o ritmo da rolagem e onde e quando cada texto e cada
// objeto aparece. Os textos em si ficam em js/content.js (os mesmos da home) — aqui só se diz onde
// eles moram neste vídeo.
//
// Unidades:
//   q      o frame do vídeo, a partir de 0 (q 0 = frame_0001.webp, q 239 = frame_0240.webp). Depois do
//          último frame, a rolagem continua um pouco (o repouso diante da janela): ali q passa de 239.
//   q: [aparece, completo, começa a sumir, sumiu]
//   em     um ponto que segue um objeto quadro a quadro (tools/frames/ancoras.json → trilhas.json)
//   tela   [x, y] posição fixa na tela (0..1)
//   desvio [x, y] deslocamento a partir do ponto, em frações da tela

// Ritmo: quantos frames cada tela de rolagem percorre, trecho a trecho. Menos frames por tela = a câmera
// anda mais devagar (onde há o que ler e clicar). A troca de ritmo entre os trechos é gradual.
export const RITMO = [
  // [até o frame, frames por tela]
  [25, 30],    // o jardim; a porta começa a abrir
  [59, 24],    // a porta se abre, a soleira, o baú
  [95, 28],    // o hall, rumo à oficina
  [151, 16],   // a oficina: a bancada e os seus objetos
  [199, 16],   // a sala da lareira
  [239, 22],   // até a janela
];
export const RITMO_CELULAR = 1.15;                // no celular, um pouco mais de rolagem para o mesmo trecho
export const REPOUSO = { quadros: 33, porTela: 10 };   // depois do último frame: q vai de 239 a 272

// Em telas em pé, só uma faixa do vídeo cabe na tela: o enquadramento acompanha o que interessa
// (u = centro da faixa, 0..1 da largura do vídeo).
export const OLHAR = [
  [0, 0.49], [28, 0.5], [40, 0.58], [54, 0.55], [70, 0.5], [95, 0.45], [112, 0.44], [128, 0.46],
  [142, 0.53], [152, 0.59], [190, 0.59], [206, 0.52], [239, 0.5],
];

// Textos (o id é o do bloco em js/content.js; "texto" substitui o de lá só nesta página).
export const TEXTOS = [
  { id: 'door-title', q: [-1, -1, 2, 8], tela: [0.5, 0.5] },
  { id: 'door-open', q: [28, 33, 44, 50], em: 'porta_arco', desvio: [0.01, 0] },
  { id: 'door-feet', q: [49, 53, 59, 63], em: 'soleira' },
  { id: 'wright-title', q: [84, 90, 97, 102], tela: [0.07, 0.3] },
  { id: 'wright-bench-1', q: [101, 105, 113, 117], em: 'nota_plantas', align: 'right' },
  { id: 'wright-bench-2', q: [103, 107, 116, 120], em: 'nota_engrenagens' },
  { id: 'wright-bench-3', q: [106, 110, 119, 123], em: 'nota_prototipos', align: 'right' },
  { id: 'wright-follow', q: [126, 130, 140, 145], em: 'lareira_longe', desvio: [0, 0.1] },
  { id: 'mathom-title', q: [146, 151, 160, 165], tela: [0.06, 0.24] },
  // aqui não há quadro sobre a lareira: o "quadro" é a janela redonda, lá no fundo
  { id: 'mathom-painting', q: [163, 167, 176, 180], em: 'janela_quadro', desvio: [0, -0.2], align: 'center', texto: 'repare no quadro, lá no fundo' },
  { id: 'painting-window', q: [192, 197, 208, 213], tela: [0.5, 0.15] },
  { id: 'rim-title', q: [214, 220, 232, 237], tela: [0.06, 0.22] },
  { id: 'rim-about', q: [236, 241, 249, 253], tela: [0.06, 0.3] },
  { id: 'rim-contact', q: [249, 253, 261, 264], tela: [0.94, 0.3], align: 'right' },
  { id: 'rim-end', q: [262, 267, 999, 999], tela: [0.5, 0.36] },
];

// Objetos e segredos.
//   mathom: o id de um objeto do Mathom em js/content.js (abre o livro de registros). Quando o objeto do
//           vídeo é outro, "titulo"/"texto" substituem os de lá só nesta página.
//   segredo: 'porta' (bater), 'luneta' (a janela), ou o rótulo de um canto escondido de content.js (hidden)
//   lanterna: acende ao passar o cursor (ou tocar)
export const OBJETOS = [
  { segredo: 'porta', em: 'macaneta', q: [0, 0, 12, 18] },
  { lanterna: true, em: 'lanterna_porta', q: [0, 0, 26, 32] },
  { mathom: 'bau', em: 'bau', q: [41, 45, 60, 66], titulo: 'O baú do corredor' },
  { lanterna: true, em: 'lanterna_hall_e', q: [42, 46, 80, 85] },
  { lanterna: true, em: 'lanterna_hall_d', q: [42, 46, 80, 85] },
  { mathom: 'armilar', em: 'laptop', q: [98, 104, 128, 134], titulo: 'O laptop',
    texto: 'Engrenagens invisíveis: sistemas e automações que giram uns dentro dos outros. Ninguém sabe exatamente o que ele calcula — mas calcula.' },
  { mathom: 'livro', em: 'livros', q: [102, 108, 138, 144] },
  { mathom: 'globo', em: 'mapas', q: [104, 110, 140, 146], titulo: 'Os mapas enrolados' },
  { segredo: 'as plantas na parede', em: 'plantas', q: [106, 112, 142, 148] },
  { lanterna: true, em: 'lanterna_oficina', q: [98, 102, 142, 148] },
  { mathom: 'tapecaria', em: 'tapete', q: [136, 142, 158, 163] },
  { segredo: 'a lareira', em: 'lareira', q: [146, 152, 172, 177] },
  { mathom: 'alaude', em: 'chaleira', q: [148, 154, 176, 182] },
  { mathom: 'urso', em: 'poltrona', q: [154, 160, 186, 192] },
  { mathom: 'navio', em: 'janela_quadro', q: [166, 171, 188, 194], quadro: true },
  { segredo: 'outra janela', em: 'outra_janela', q: [201, 205, 225, 230] },
  { segredo: 'luneta', em: 'janela_final', q: [226, 231, 256, 261] },
  { lanterna: true, em: 'lanterna_fim_e', q: [212, 218, 999, 999] },
  { lanterna: true, em: 'lanterna_fim_d', q: [212, 218, 999, 999] },
];

// Pela luneta: o ponto da paisagem (no último frame) que ela aproxima, e quanto.
export const LUNETA = { u: 0.645, v: 0.51, zoom: 3.4 };
