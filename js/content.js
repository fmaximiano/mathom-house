// ─────────────────────────────────────────────────────────────────────────────
//  TEXTOS DA MATHOM-HOUSE
//  Tudo o que o visitante lê está aqui. Edite à vontade: títulos, parágrafos,
//  objetos do Mathom (projetos) e contatos. Não é preciso mexer em mais nada.
//
//  Campos de posicionamento (normalmente não precisam mudar):
//    scene  vista onde o texto vive ('s01' … 's10', na ordem do passeio — ver js/journey.js)
//    at     [u, v, recuo]  ponto da imagem (0..1, 0..1) onde o texto "flutua";
//           recuo = quanto o texto fica à frente da superfície (em metros, aproximadamente)
//    screen [x, y]  alternativa ao "at": posição fixa na tela (0..1)
//    t      [aparece, completo, começa a sumir, sumiu] — momentos do passeio (0..1);
//           a câmera passa pelo ponto exato de cada vista em 0, 0.1, 0.2 … 0.9 (e chega
//           à janela em 1)
//    align  'left' | 'center' | 'right'
// ─────────────────────────────────────────────────────────────────────────────

export const site = {
  title: 'Mathom-house',
  tagline: 'Uma toca cheia de coisas que ninguém sabe bem para que servem — e que ninguém tem coragem de jogar fora.',
  enter: 'Entrar com som',
  enterSilent: 'Entrar em silêncio',
  scrollHint: 'role para entrar',
  loading: 'acendendo as lanternas',
  backHome: 'Voltar à Round Door',
};

export const blocks = [
  // ── Round Door (s01–s02) ────────────────────────────────────────────────
  {
    id: 'door-title', scene: 's01', kind: 'hero', screen: [0.5, 0.5], t: [-1, -1, 0.012, 0.04], align: 'center',
    eyebrow: 'Grã-Cava, no Condado',
    title: 'Mathom-house',
    text: site.tagline,
  },
  {
    id: 'door-open', scene: 's02', kind: 'line', at: [0.64, 0.3, 0.3], t: [0.07, 0.088, 0.115, 0.135], align: 'left',
    eyebrow: 'I · Round Door',
    text: 'A porta está aberta.<br>Sempre esteve.',
  },

  // ── Hall (s03–s04) ──────────────────────────────────────────────────────
  {
    id: 'door-feet', scene: 's03', kind: 'whisper', at: [0.3, 0.84, 0.1], t: [0.185, 0.195, 0.215, 0.23], align: 'center',
    text: 'limpe os pés',
  },

  // ── Wright-room (s05–s06) ───────────────────────────────────────────────
  {
    id: 'wright-title', scene: 's05', kind: 'title', at: [0.2, 0.26, 0.5], t: [0.37, 0.388, 0.42, 0.44], align: 'left',
    eyebrow: 'II · Wright-room',
    title: 'A oficina',
    text: 'Aqui as ideias ganham mãos. Plantas desenhadas pela metade, engrenagens sem máquina, protótipos que funcionam só às terças.',
  },
  {
    id: 'wright-bench-1', scene: 's06', kind: 'note', at: [0.04, 0.2, 0.3], t: [0.468, 0.48, 0.52, 0.535], align: 'left',
    eyebrow: 'Na bancada',
    title: 'Plantas',
    text: 'Sistemas pequenos e teimosos, desenhados antes de construídos.',
  },
  {
    id: 'wright-bench-2', scene: 's06', kind: 'note', at: [0.47, 0.14, 0.3], t: [0.472, 0.485, 0.524, 0.539], align: 'left',
    eyebrow: 'Na bancada',
    title: 'Engrenagens',
    text: 'Automações que trabalham enquanto a casa dorme.',
  },
  {
    id: 'wright-bench-3', scene: 's06', kind: 'note', at: [0.04, 0.62, 0.3], t: [0.476, 0.49, 0.528, 0.543], align: 'left',
    eyebrow: 'Na bancada',
    title: 'Protótipos',
    text: 'Ferramentas e experimentos que começam num guardanapo.',
  },
  {
    id: 'wright-follow', scene: 's06', kind: 'whisper', at: [0.74, 0.66, 0.3], t: [0.49, 0.5, 0.535, 0.55], align: 'center',
    text: 'siga a luz da lareira',
  },

  // ── Mathom (s07–s08) ────────────────────────────────────────────────────
  {
    id: 'mathom-title', scene: 's07', kind: 'title', at: [0.03, 0.07, 0.5], t: [0.57, 0.588, 0.62, 0.64], align: 'left',
    eyebrow: 'III · Mathom',
    title: 'O coração da casa',
    text: '<em>Mathom</em>: qualquer coisa que não tem uso, mas que também não se joga fora. Esta sala é feita delas. Passe o cursor pelos objetos — alguns têm histórias.',
  },
  {
    id: 'mathom-painting', scene: 's08', kind: 'whisper', at: [0.5, 0.1, 0.3], t: [0.68, 0.692, 0.72, 0.735], align: 'left',
    text: 'repare no quadro sobre a lareira',
  },

  // ── World-rim (s09–s10) ─────────────────────────────────────────────────
  {
    id: 'painting-window', scene: 's09', kind: 'line', screen: [0.5, 0.17], t: [0.775, 0.79, 0.815, 0.835], align: 'center',
    text: 'Todo quadro, se você olhar por tempo suficiente,<br>vira janela.',
  },
  {
    id: 'rim-title', scene: 's10', kind: 'title', at: [0.07, 0.16, 0.3], t: [0.875, 0.89, 0.915, 0.932], align: 'left',
    eyebrow: 'IV · World-rim',
    title: 'A borda do mundo',
    text: 'Depois de todas as portas, o horizonte. É daqui que as ideias partem — e é por aqui que chegam as cartas.',
  },
  {
    id: 'rim-about', scene: 's10', kind: 'note', at: [0.1, 0.25, 0.3], t: [0.922, 0.932, 0.948, 0.956], align: 'left',
    eyebrow: 'Quem mora aqui',
    title: 'Um colecionador de mathoms',
    text: 'Alguém que constrói coisas por curiosidade, guarda o que aprende e gosta de mostrar a casa para quem bate à porta.',
  },
  {
    id: 'rim-contact', scene: 's10', kind: 'contact', at: [0.9, 0.3, 0.3], t: [0.952, 0.96, 0.972, 0.979], align: 'right',
    eyebrow: 'Correio',
    title: 'Escreva',
    text: 'Cartas, ideias, convites para aventuras (com hora marcada para o chá).',
  },
  {
    id: 'rim-end', scene: 's10', kind: 'finale', screen: [0.5, 0.38], t: [0.975, 0.99, 2, 2], align: 'center',
    eyebrow: 'Fim do passeio — por enquanto',
    title: 'A estrada segue sempre em frente.',
  },
];

// Canais de contato mostrados no bloco "Escreva". Deixe "href" vazio para ocultar.
export const contacts = [
  { label: 'GitHub', href: 'https://github.com/fmaximiano' },
  { label: 'E-mail', href: '' },       // ex.: 'mailto:voce@exemplo.com'
  { label: 'LinkedIn', href: '' },
];

// Objetos do Mathom. Cada um é um projeto, experimento ou achado.
// scene: a vista onde o objeto está ('s07' ou 's08'); at: [u, v] — posição do objeto na imagem.
// O objeto aparece enquanto a câmera está perto dessa vista.
export const mathoms = [
  {
    id: 'alaude', scene: 's07', at: [0.475, 0.235], title: 'A chaleira que assobia',
    kind: 'Experimento sonoro', year: '—',
    text: 'Pequenas máquinas de fazer som: sintetizadores feitos de código, escalas antigas e muita tentativa. Toca de verdade — experimente.',
    link: '', sound: 'lute',
  },
  {
    id: 'bau', scene: 's07', at: [0.33, 0.585], title: 'O baú de ferro',
    kind: 'Arquivo', year: '—',
    text: 'Projetos antigos que ninguém usa, mas que ensinaram quase tudo. Alguns ainda rangem quando abertos.',
    link: '',
  },
  {
    id: 'urso', scene: 's08', at: [0.07, 0.52], title: 'A poltrona gasta',
    kind: 'Mathom clássico', year: '—',
    text: 'Afundada no lugar certo, remendada no braço. Ninguém lembra de onde veio, ninguém deixaria que fosse embora. Toda coleção precisa de um objeto que só existe por afeto.',
    link: '',
  },
  {
    id: 'livro', scene: 's08', at: [0.1, 0.65], title: 'Os livros sobre a mesa',
    kind: 'Cadernos', year: '—',
    text: 'Anotações, rascunhos e textos sobre o que foi aprendido no caminho. Sempre marcados na página mais interessante.',
    link: '',
  },
  {
    id: 'globo', scene: 's08', at: [0.135, 0.265], title: 'O globo dourado',
    kind: 'Mapas', year: '—',
    text: 'Visualizações, mapas e formas de enxergar dados como se fossem terras a explorar.',
    link: '',
  },
  {
    id: 'armilar', scene: 's08', at: [0.06, 0.335], title: 'A esfera armilar',
    kind: 'Mecanismos', year: '—',
    text: 'Engrenagens, anéis e sistemas que giram uns dentro dos outros. Ninguém sabe exatamente o que ela mede — mas mede.',
    link: '',
  },
  {
    id: 'navio', scene: 's08', at: [0.35, 0.07], title: 'O quadro da casa',
    kind: 'Projeto paralelo', year: '—',
    text: 'Uma casa pintada dentro de uma casa. Para os projetos paralelos — os que moram dentro de outros, sem pressa e sem porto definido.',
    link: '',
  },
  {
    id: 'tapecaria', scene: 's07', at: [0.46, 0.82], title: 'O tapete persa',
    kind: 'Raízes', year: '—',
    text: 'Cada fio veio de algum lugar: referências, influências e gente que ensinou alguma coisa. É por cima dele que se chega à lareira.',
    link: '',
  },
];

// Cantos escondidos: não têm brilho algum; só quem passa o cursor por perto descobre.
// at: [u, v] na imagem da vista; t: [aparece, completo, some, sumiu].
export const hidden = [
  { scene: 's05', at: [0.57, 0.3], t: [0.37, 0.385, 0.425, 0.44], label: 'as plantas na parede', text: 'Plantas de uma máquina que ainda não existe. Ainda.' },
  { scene: 's06', at: [0.43, 0.43], t: [0.47, 0.485, 0.525, 0.54], label: 'o globo', text: 'O mundo inteiro, em escala de mesa.' },
  { scene: 's08', at: [0.38, 0.5], t: [0.67, 0.685, 0.725, 0.74], label: 'a lareira', text: 'Ninguém lembra quem acendeu. Ninguém deixa apagar.' },
  { scene: 's10', at: [0.18, 0.3], t: [0.87, 0.885, 0.965, 0.98], label: 'outra janela', text: 'Esta também é um quadro. Mas essa é outra história.' },
];

// Pequenas descobertas espalhadas pela casa (aparecem ao passar o cursor ou tocar).
export const secrets = {
  knock: 'Toc, toc. Quem será a esta hora?',
  lantern: 'A lanterna gosta de companhia.',
  painting: '…ele acabou de se mexer?',
  telescope: 'Lá longe, a estrada continua.',
  telescopeHint: 'olhar pela janela redonda',
  ring: 'Você colocou o anel. Tudo ficou cinza e distante.',
  night: 'Boa noite. As lanternas ficam acesas para quem chega tarde.',
  welcomeBack: 'De volta? A chaleira ainda está quente.',
};
