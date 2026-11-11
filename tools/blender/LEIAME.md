# A toca em 3D: do Blender para o site

Dois jeitos de usar o modelo `.blend` da toca, e uma página de teste para cada um:

| | Passeio pré-renderizado | 3D em tempo real |
|---|---|---|
| Como é | o Blender renderiza ~300 quadros; o site mostra o quadro de cada posição da rolagem | o navegador desenha a toca ao vivo a partir de um `.glb` |
| Qualidade | de cinema (Cycles: luz, sombras e reflexos reais) | com a luz assada (seção 5), a luz do Cycles de qualquer ângulo; sem ela, luzes de jogo |
| Liberdade | o caminho é fixo | arrastar para olhar em volta e caminhar livre (teclado ou rodinha) |
| Peso no site | ~40 MB, carregados aos poucos | ~20 MB (`toca.glb`, o céu e os mapas de luz) |
| O modelo fica exposto? | não, só imagens | sim, qualquer visitante pode baixar o `.glb` |
| Página de teste | `passeio.html` | `modelo.html` |

Os scripts ficam nesta pasta (`tools/blender/`). Os arquivos gerados para o site vão para `assets/passeio/` e
`assets/modelo/`.

---

## 1. Instalar o Blender

Use o **Blender 4.5 LTS** ou o **5.2 LTS** ([blender.org/download/lts](https://www.blender.org/download/lts/)). Os scripts foram
testados nos dois.

Os comandos abaixo chamam o Blender pelo terminal. O caminho do programa muda com o sistema:

| Sistema | Troque `blender` por |
|---|---|
| Windows | `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"` |
| macOS | `/Applications/Blender.app/Contents/MacOS/Blender` |
| Linux | `blender` (ou o caminho da pasta onde você descompactou) |

## 2. O caminho da câmera

Os scripts descobrem sozinhos:

- **Se a cena tem uma câmera animada** (como a `TOUR - continuous walk` do arquivo da Mathom-house), o passeio é
  essa animação, do primeiro ao último quadro da linha do tempo. Tudo o que se move junto na linha do tempo (a porta
  que se abre, por exemplo) vai junto, no mesmo ritmo. Não é preciso preparar nada.
- **Se não**, marque o caminho com câmeras chamadas `cam_01`, `cam_02`, `cam_03`…: para cada ponto de vista,
  enquadre a janela 3D, **Add → Camera**, **Ctrl+Alt+0** (ou **View → Align View → Align Active Camera to View**) e
  renomeie com **F2**. A câmera anda numa curva suave entre elas. Para a porta se abrir nesse modo, a origem do objeto
  precisa estar na dobradiça (**Object → Set Origin → Origin to 3D Cursor**) e você passa `--porta NomeDaPorta`.

Se o arquivo tem várias cenas, os scripts usam a que tem a câmera animada (ou a indicada com `--cena "Nome"`).

Opcional, nos dois casos:
- **Objetos clicáveis:** renomeie com o prefixo `clique_` ou liste com `--clicaveis "Central globe*,Laptop*"` (o `*` junta
  todas as peças de um objeto composto).
- **Pontos para textos:** **Add → Empty → Plain Axes** onde um texto deve "morar", com o prefixo `ponto_`.
- **Texturas:** se algo aparecer rosa, **File → External Data → Pack Resources** e salve.

## 3. Passeio pré-renderizado

Num terminal, na pasta onde está o `.blend` (troque `REPO` pelo caminho da pasta `mathom-house-2`):

**Teste rápido** (12 quadros pequenos, alguns minutos):
```
blender -b toca.blend -P REPO/tools/blender/render_passeio.py -- --teste
```
Confira as imagens em `render/teste/quadros/`.

**Render completo** (o que foi usado no arquivo da Mathom-house):
```
blender -b toca.blend -P REPO/tools/blender/render_passeio.py -- --res 1280x720 --amostras 32 --clicaveis "Central globe*,Brass armillary sphere*,Travel chest*,Cognac reading armchair*,Woven carpet*,Laptop*"
```
- Com o redutor de ruído do Cycles, 32 amostras já ficam limpas. Para mais nitidez: `--res 1920x1080 --amostras 64`.
- Tempo: numa placa de vídeo recente, 5–20 s por quadro (300 quadros ≈ 30–90 min). Só com processador (`--cpu`), cerca
  de 1,5 min por quadro em 1280×720 — umas 7 horas.
- Os quadros saem **do mais espaçado ao mais fino** (1 a cada 32, depois 16, 8…): em pouco tempo já dá para ver o
  passeio inteiro, só que aos saltos; ele vai ficando contínuo. (`--em-ordem` renderiza 1, 2, 3…)
- Pode interromper (Ctrl+C) quando quiser: rodando o mesmo comando de novo, ele continua de onde parou.
- Outras opções: `--quadros 400` (passeio mais suave), `--de 1 --ate 150` (dividir em partes), `--rapido` (menos
  rebatimentos de luz). A lista completa está no começo do script.

**Ver no navegador** (na pasta `mathom-house-2`):
```
pip install pillow
python tools/blender/preparar_web.py caminho/para/render
python -m http.server 8000
```
Abra <http://localhost:8000/passeio.html> e role a página. Pode rodar o `preparar_web.py` de novo a qualquer momento
do render: ele só converte os quadros novos.

## 4. 3D em tempo real

Na pasta do `.blend` (de preferência o `toca_web.blend` otimizado — seção 5):
```
blender -b toca_web.blend -P REPO/tools/blender/exportar_glb.py -- --saida REPO/assets/modelo/toca.glb --clicaveis "Central globe*,Brass armillary sphere*,Travel chest*,Cognac reading armchair*,Woven carpet*,Laptop*"
```
Leva cerca de 1 minuto com o `toca_web.blend` (20–30 minutos com o `.blend` original). O script:
- junta os milhares de objetos fixos em um por material (o navegador desenha dezenas de peças em vez de milhares) —
  a não ser que o `.blend` já venha juntado por cômodo (`web_otimizado`, seção 5);
- guarda nos vértices as cores feitas com nós (folhas, musgo: ruído + rampa de cor), que o formato `.glb` não entende;
- leva a câmera animada, a porta, as lanternas e o sol; as luzes de área viram luzes retangulares no site;
- fotografa o céu (o *World*) em 360° (`toca-ceu.hdr`): ele vira o fundo, o reflexo e o sol com sombra;
- mede quanto céu a câmera vê em cada ponto do passeio, para a luz ambiente ser forte lá fora e fraca dentro da toca;
- reduz texturas grandes (`--textura-max 2048`), comprime a geometria (Draco) e avisa se ficou pesado demais.

Com o servidor rodando (`python -m http.server 8000`), abra <http://localhost:8000/modelo.html>:
- **rolar** anda pelo passeio (o mesmo do pré-renderizado);
- **arrastar** "segura" a imagem para olhar em volta (arrastar para a direita mostra o que está à esquerda); ao
  voltar a rolar, a vista retorna sozinha para a frente; **duplo clique** volta na hora;
- **L** (ou o botão) liga o **caminhar livre**: a rodinha, WASD ou as setas andam para onde você olha, Q/E descem e
  sobem, Shift corre;
- o painel tem exposição (começa igual à do Blender), luz ambiente, intensidade das luzes, qualidade (resolução),
  **luz assada do Cycles** (liga/desliga, para comparar), sombras e **qualidade automática** (baixa a resolução
  sozinha se os quadros por segundo caírem), e mostra quadros por segundo e triângulos — bom para medir no celular.

Sem luz assada, o navegador não calcula a luz rebatida nem a sombra das lanternas. Para compensar, cada grupo de luz
entra com um peso (`PESO`, no começo de `js/lab/modelo.js`), calibrado comparando o 3D com os quadros do Cycles.

## 5. Luz assada: mais leve e com a luz do Cycles

O `.blend` pode ser preparado para a web (no Blender, por você ou por um assistente de IA integrado a ele — o prompt
usado na Mathom-house está em [`PROMPT_blender_web.md`](PROMPT_blender_web.md)):
1. **mais leve**: menos triângulos onde não se vê (folhagens, chanfros, jardim distante);
2. **juntado por cômodo e material**, em coleções `sala_<cômodo>` — o navegador deixa de desenhar os cômodos fora da
   tela;
3. **luz assada**: o Cycles calcula a luz difusa (direta + rebatida) e grava num mapa por cômodo (segundo UV "Luz",
   imagem `luz/luz_<sala>.exr`) ou, nas plantas, nos vértices (atributo de cor "Luz").

O exportador reconhece essas marcas (propriedades personalizadas):

| Onde | Propriedade | Significado |
|---|---|---|
| cena | `web_otimizado = 1` | já juntado por cômodo: o exportador não junta de novo |
| objeto | `luz_mapa = "luz_sala_mathom"` | usa esse mapa de luz, no UV `luz_uv` (padrão "Luz") |
| objeto | `luz_vertices = 1` | a luz está no atributo de cor "Luz" |
| objeto | `web_sala = "sala_exterior"` | o cômodo (as plantas de fora recebem um reforço de luz) |

Ao exportar, os mapas de luz viram `luz/<nome>.png` ao lado do `.glb` (2048 px, com uma curva logarítmica que guarda
da penumbra ao clarão das lanternas; `--luz-max 4096` para mais nitidez, ao custo de 4× mais memória no celular). A luz
dos vértices vai dentro do `.glb`; nas peças finas (caules, pétalas), onde o bake erra para baixo, ela é reforçada com a
luz das partes vizinhas mais claras.

No site, as malhas com luz assada usam essa luz no lugar das luzes em tempo real (que ficam só para a porta, que se
move, os vidros e as chamas). Na Mathom-house, cada quadro ficou 4 vezes mais rápido que no modelo original.

Limites: a luz assada não tem os reflexos nítidos do Cycles (o brilho do latão e da madeira é aproximado), e a porta foi
assada fechada. Pedras do piso que atravessam os tapetes aparecem como manchas escuras — para corrigir, suba um pouco os
tapetes no Blender e asse de novo.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `blender: comando não encontrado` | use o caminho completo do programa (tabela do passo 1) |
| `preciso de pelo menos duas câmeras cam_01…` | a cena não tem câmera animada: marque o caminho (passo 2) |
| `não encontrei o objeto 'X'` | o nome está diferente; copie do *Outliner* (maiúsculas contam) |
| texturas rosa no render | **File → External Data → Pack Resources** e salve de novo |
| "nenhuma placa de vídeo compatível" | atualize o driver; no Blender, **Edit → Preferences → System → Cycles Render Devices** deve listar a placa |
| render muito granulado | `--amostras 64` ou `128` |
| muito lento | `--res 1280x720 --amostras 32`; diminua `--quadros` |
| `modelo.html` muito lento | diminua *qualidade* no painel; desligue as sombras; exporte com `--textura-max 1024`; simplifique objetos distantes (modificador *Decimate*) |
