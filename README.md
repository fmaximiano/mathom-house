# Mathom-house

> Uma toca hobbit que, por acaso, contém um site.

Inspirada no conceito tolkieniano de uma casa destinada a guardar e preservar coisas queridas e curiosas sem uso imediato, a **Mathom-house** é um acervo digital pessoal e uma experiência interativa pela toca.

Este repositório unifica a **página tradicional e arquivo digital** (`mathom-house`) com a **experiência imersiva de passeios visuais e modelos 3D** (`mathom-house-2`), oferecendo um portal inicial com seleção de modos de navegação e um alternador flutuante acessível em todas as páginas.

---

## As Experiências Disponíveis

Ao acessar o domínio, o visitante é recepcionado por um portal de entrada com 6 opções de visualização:

| # | Opção | Rota | Stack / Tecnologia | Descrição |
|---|---|---|---|---|
| 1 | **Página estática (HTML / CSS)** | `/estatica.html` (ou `/estatica`) | React, Vite, Tailwind CSS | O arquivo digital pessoal com biografia, currículo, ensaios técnicos, projetos, biblioteca e o assistente de IA na oficina (*The Wright-room*). |
| 2 | **Passeio Interativo (WebGL Híbrido)** | `/passeio-interativo.html` | WebGL2, GLSL Shaders, Cine Engine | Caminhada imersiva contínua pela toca hobbit com aproximação suave orientada por rolagem, chamas tremulantes em shader, áudio ambiente sintetizado e textos flutuantes ancorados nas cenas. |
| 3 | **Passeio Leve (Animação Otimizada por Frames)** | `/passeio-leve.html` | Canvas 2D, Frames Pré-renderizados | Versão de alto desempenho desenhada diretamente em Canvas 2D a partir de uma sequência pré-extraída de quadros. Ideal para dispositivos móveis ou conexões modestas. |
| 4 | **Passeio Guiado (Sequência Pré-renderizada)** | `/passeio-guiado.html` | Blender Cycles, Trilha Cinemática | Laboratório com iluminação realista assada do Cycles, trajetórias pré-calculadas, objetos clicáveis com etiquetas e controle dinâmico de luzes. |
| 5 | **Modelo Interativo (3D em Tempo Real via Canvas)** | `/modelo-interativo.html` | Three.js, WebAssembly (Draco), GLB | Geometria tridimensional completa da toca hobbit com rotação de órbita livre, modo de caminhada em primeira pessoa (`tecla L`), controle de sol, sombras, qualidade e exposição. |
| 6 | **Vista do Relevo (Malha Topográfica 3D)** | `/passeio-interativo.html?3d` | Depth Anything V2, Engine 3D | Reconstrução volumétrica das cenas fotográficas através de mapas de relevo e profundidade métrica gerados por redes neurais, com câmera navegando livremente no relevo. |

---

## Alternador Global de Experiências

Em todas as páginas, um botão flutuante discreto **`🧭 Experiências`** (canto superior esquerdo) abre um painel modal que permite alternar instantaneamente entre qualquer uma das 6 opções ou retornar ao menu principal, sem perder o fluxo de navegação.

---

## Como Rodar Localmente

### Pré-requisitos
- Node.js (v18+) e npm

### Instalação
```bash
npm install
```

### Modo de Desenvolvimento
Inicia o servidor com suporte a recarregamento automático:
```bash
npm run dev
```
Acesse <http://localhost:3000> para ver o portal de entrada.

### Build de Produção e Execução
Compila todas as páginas multi-page do Vite e o servidor Express:
```bash
npm run build
npm start
```

---

## Estrutura do Repositório

```text
mathom-house/
├── index.html                   # Portal de entrada com o menu das 6 opções
├── estatica.html                # Página Estática (HTML / CSS) - Aplicação React
├── passeio-interativo.html      # Passeio Interativo (WebGL Híbrido)
├── passeio-leve.html            # Passeio Leve (Frames em Canvas 2D)
├── passeio-guiado.html          # Passeio Guiado (Pré-renderizado Cycles)
├── modelo-interativo.html       # Modelo Interativo (3D em Tempo Real)
├── vista-relevo.html            # Redirecionamento para a Vista do Relevo (?3d)
├── src/                         # Código-fonte React (componentes, artigos, assistente)
├── server.ts                    # Servidor Express com rotas de API e Vite middleware
├── public/                      # Assets estáticos servidos na raiz
│   ├── assets/
│   │   ├── scenes/              # Fotos e mapas de profundidade das cenas
│   │   ├── frames/              # Frames pré-extraídos para o passeio leve
│   │   ├── modelo/              # Modelo toca.glb e texturas 3D
│   │   └── passeio/             # Assets da sequência pré-renderizada
│   ├── css/                     # Estilos compartilhados e switcher.css
│   └── js/                      # switcher.js e scripts globais
├── js/                          # Motores Cine.js, Engine.js e áudio sintetizado
├── css/                         # Folhas de estilo das experiências imersivas
├── tools/                       # Scripts Python para processamento de fotos e 3D
├── vercel.json                  # Configuração de deploys e rewrites da Vercel
├── Caddyfile.template           # Configuração de servidor Caddy para Railway
└── vite.config.ts               # Configuração multi-page do Vite
```

---

## Deploy

- **Vercel**: O arquivo `vercel.json` gerencia rewrites limpos para todas as rotas (`/estatica`, `/interativo`, `/frames`, `/passeio`, `/modelo`, `/relevo`) e direciona rotas `/api/*` para o backend Railway.
- **Railway**: Pode ser hospedado como aplicação Node.js (`npm run build && npm start`) ou como site estático de alta velocidade com o Caddy (`Caddyfile.template`).

---

## Créditos

- Tipografia: *Fraunces* e *IBM Plex Mono* (Google Fonts)
- Renderização 3D e Shaders: Three.js
- Interface e Portfólio: React, Tailwind CSS, Motion, Lucide Icons
- Autor: [Felipe Maximiano](https://github.com/fmaximiano)
