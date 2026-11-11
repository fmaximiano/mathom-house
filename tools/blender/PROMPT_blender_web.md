# Prompt: preparar o .blend para a web (mais leve + luz assada)

Prompt usado com um assistente de IA integrado ao Blender para gerar o `toca_web.blend` da Mathom-house (ver a
seção 5 do [LEIAME](LEIAME.md)). Os nomes de objetos, câmeras e materiais são os do arquivo da Mathom-house; para
outro modelo, ajuste-os.

```
Você vai preparar uma versão "para a web" do meu modelo da toca (Mathom-house). Trabalhe com Python (bpy),
em etapas, e PARE ao fim de cada etapa para eu conferir antes de seguir.

## Contexto
- Arquivo atual: toca.blend (Blender 4.5/5.x). Cena principal: "02 | Continuous walk".
- A câmera animada "TOUR - continuous walk" (quadros 1–1537, 24 fps) é o passeio do site. A porta
  "ENTRY DOOR - animated hinge" (e seus 43 filhos) é animada.
- Um script meu (exportar_glb.py) exporta a cena para .glb e a mostra num navegador com three.js. Hoje o
  resultado tem 1,55 milhão de triângulos e 25 luzes calculadas em tempo real — pesado demais.
- Onde estão os triângulos hoje (por material): madeira "01 | Aged honey oak - packed PBR" 378 mil (muito disso
  vem de modificadores Bevel); "Leaf 0/1/2/3" 450 mil somadas; "07 | Salt glazed terracotta" 102 mil;
  "03 | Warm limestone rubble" 87 mil; "09 | Hammered black iron" 44 mil; "04 | Flagstone" 36 mil;
  "10 | Patinated brass" 35 mil; cada "Ivory daisy petals.00X" 29 mil.
- Cômodos, na ordem do passeio: Exterior (jardim) > Vestíbulo > Wright Room (com a oficina) > Mathom > World Rim.
  A casa se estende ao longo do eixo X. As 4 luzes "Soft interior bounce" (x = 0; 5,8; 11,3; 19) ficam uma em cada
  cômodo interno; as 19 câmeras de referência ("01 Exterior - closed door" … "10 Final window") mostram onde cada
  cômodo começa.

## Regras gerais
- NUNCA altere o toca.blend original. Salve tudo em toca_web.blend (e salve versões ao fim de cada etapa:
  toca_web_etapa1.blend etc.).
- Não mexa em: câmeras e animação do TOUR, animação da porta, World (céu), luzes, configurações de cor
  (AgX, exposição 0,3), nomes dos materiais.
- Mantenha como objetos separados, com o nome original no início, estes clicáveis do site:
  "Central globe*", "Brass armillary sphere*", "Travel chest*", "Cognac reading armchair*", "Woven carpet*", "Laptop*".
- Antes de qualquer operação destrutiva em muitos objetos, me diga quantos objetos serão afetados.
- Ao fim de cada etapa, me dê um relatório curto com números (triângulos antes/depois, objetos, arquivos gerados).

## Etapa 1 — Deixar mais leve (meta: ≤ 600 mil triângulos, sem diferença visível no passeio)
1. Faça um inventário: triângulos por material, por coleção e por tipo de modificador (Bevel, Subdivision, Array,
   Screw…). Liste os 30 objetos mais pesados.
2. Simplifique onde não se vê diferença:
   - Folhagens (materiais Leaf 0–3, heras, samambaias, flores): Decimate (Collapse) nos mais densos; nas curvas
     (heras/caules), reduza resolution_u e bevel_resolution.
   - Madeiras com Bevel: reduza segmentos (1 ou 2) e limite por ângulo; aplique o modificador.
   - Vasos de terracota, metais e latão: reduza segmentos/subdivisões mantendo a silhueta.
   - Pétalas de margarida: Decimate forte (são minúsculas no enquadramento).
   - Jardim distante: apague ou simplifique muito o que nunca aparece no passeio. Para saber o que aparece, amostre a
     câmera TOUR a cada 10 quadros e teste visibilidade (ou distância > 15 m do caminho).
3. Não decimate superfícies planas grandes (paredes, piso) nem o que aparece de perto na câmera com silhueta visível.
4. Compare antes/depois renderizando no Cycles (baixa amostragem basta) os quadros 1, 330, 782 e 1316 da câmera
   TOUR; me mostre as imagens lado a lado.
5. PARE e me mostre o relatório.

## Etapa 2 — Organizar por cômodo (para o navegador não desenhar o que está fora da tela)
1. Crie as coleções "sala_exterior", "sala_vestibulo", "sala_wright", "sala_mathom", "sala_worldrim" e mova cada
   objeto para o cômodo onde ele está (use as posições das câmeras de referência e das luzes "Soft interior bounce"
   para definir as divisas; ex.: meio do caminho entre elas no eixo X). Confira visualmente.
2. Peças contínuas que atravessam vários cômodos (ex.: "Barrel vault continuous shell", pisos e paredes compridas):
   corte-as nas divisas (Bisect com Fill desligado) e distribua cada pedaço no seu cômodo.
3. Dentro de cada cômodo, junte os objetos estáticos por material (um objeto por material por cômodo), nomeando
   "<sala> | <material>" (ex.: "sala_mathom | 03 | Warm limestone rubble"). NÃO junte: a porta animada e seus
   filhos, os clicáveis, vidros ("Hand blown window glass"), chamas ("Fire & candle emission"), câmeras, luzes e
   vazios.
4. Crie na cena a propriedade personalizada web_otimizado = 1 (meu exportador vai ler isso).
5. PARE e me mostre o relatório (objetos e triângulos por cômodo).

## Etapa 3 — "Assar" a luz do Cycles (lightmaps)
Objetivo: gravar em imagens a iluminação completa do Cycles (luz direta + rebatida, sombras das lanternas), para o
site mostrar essa luz de qualquer ângulo, quase sem luzes em tempo real.
1. Em cada objeto estático de cada cômodo (incluindo os clicáveis), crie um SEGUNDO mapa UV chamado "Luz" (sem mexer
   no UV original, que as texturas repetidas continuam usando). Gere-o com Lightmap Pack (ou Smart UV Project +
   Pack Islands) com todos os objetos do mesmo cômodo compartilhando um único espaço UV sem sobreposição, margem de
   8 px na resolução final, densidade parecida em todo o cômodo (um pouco mais para piso e paredes próximos do
   caminho).
2. Crie uma imagem por cômodo: "luz_<sala>", 4096×4096, float 32 bits, fundo preto. Em cada material, adicione um nó
   Image Texture com essa imagem, selecionado (ativo) e DESCONECTADO (só como alvo do bake; não altere a aparência),
   usando o mapa "Luz".
3. Bake no Cycles (GPU se houver; 512 amostras): tipo Diffuse, com Direct + Indirect ligados e Color DESLIGADO (quero
   só a luz, sem a cor da textura). Margin 8 px, tipo Extend. Porta na posição do quadro 1 (fechada).
4. Remova o ruído de cada imagem com o nó Denoise do compositor e salve em "//luz/luz_<sala>.exr" (OpenEXR, half
   float, linear). Depois remova os nós temporários dos materiais.
5. Folhagens e plantas não entram na imagem: grave a luz nos vértices (atributo de cor "Luz", Face Corner, Byte ou
   Float; bake Diffuse Direct+Indirect sem Color, target Vertex Colors).
6. Em cada objeto que recebeu luz, crie as propriedades personalizadas: luz_mapa = "luz_<sala>" (ou
   luz_vertices = 1, nas folhagens) e luz_uv = "Luz".
7. Verifique: nenhuma sobreposição no UV "Luz" (Select > Select All by Trait > Overlap); as imagens não têm manchas
   pretas nas emendas; renderize os mesmos quadros da etapa 1 com um material de teste que mostre só a luz assada e
   compare com o Cycles normal.
8. PARE e me mostre o relatório: imagens geradas (tamanho, cômodo), objetos com luz_mapa/luz_vertices, tempo de bake
   e eventuais problemas.

## Entregáveis finais
- toca_web.blend (com as texturas originais empacotadas: File > External Data > Pack Resources);
- a pasta "luz/" com os .exr, ao lado do .blend;
- um arquivo relatorio_web.txt com os números de cada etapa.
```
