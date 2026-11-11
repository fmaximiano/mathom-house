"""
Renderiza o passeio pela toca como uma sequência de imagens, para o site rolar quadro a quadro.

Uso (num terminal, na pasta onde está o toca.blend):
    blender -b toca.blend -P caminho/para/render_passeio.py -- [opções]

De onde vem o caminho da câmera (automático):
  1. se a cena tem uma câmera animada (como a "TOUR - continuous walk" da Mathom-house),
     usa essa animação, amostrada em --quadros quadros do começo ao fim da cena;
  2. senão, traça uma curva suave entre as câmeras cam_01, cam_02… (e --porta abre a porta).
  Se o arquivo tem várias cenas, usa a que tem a câmera animada (ou --cena "Nome").

Opções (todas opcionais):
    --teste               12 quadros pequenos e rápidos, para conferir (pasta render/teste)
    --quadros 300         total de quadros do passeio
    --res 1920x1080       resolução
    --amostras 128        qualidade do Cycles (mais = menos granulado, mais lento)
    --cena "Nome"         a cena a renderizar
    --pausa 0.35          (câmeras cam_XX) quanto a câmera desacelera ao passar por cada uma (0 a 1)
    --porta NOME          (câmeras cam_XX) objeto da porta que se abre (origem na dobradiça)
    --porta-angulo -100   quanto a porta gira, em graus (troque o sinal se abrir para o lado errado)
    --porta-eixo Z        eixo da rotação da porta (X, Y ou Z, no próprio objeto)
    --porta-entre 1 2     a porta abre enquanto a câmera vai de cam_01 a cam_02
    --clicaveis "a*,b"    objetos clicáveis no site, além dos que começam com "clique_". Cada item
                          vira um clicável; com * junta várias peças (ex.: "Central globe*")
    --de 1 --ate 300      renderiza só esse intervalo (para dividir o trabalho)
    --saida render        pasta de saída (relativa à pasta atual)
    --refazer             renderiza de novo quadros que já existem (por padrão, pula)
    --em-ordem            renderiza 1, 2, 3… (por padrão vai do mais espaçado ao mais fino:
                          1 a cada 32, depois 16, 8… — dá para ver o passeio inteiro cedo)
    --cpu                 não usa a placa de vídeo
    --rapido              menos rebatimentos de luz (bem mais rápido, quase igual; bom para CPU)

Saída (em --saida):
    quadros/0001.png …    o passeio
    luzes/0001.png …      só o que emite luz (chamas, lanternas), para o tremular no site
    ids/0001.png …        qual objeto clicável está em cada pixel (valor = índice)
    camera.json           a câmera em cada quadro (para prender textos e objetos no site)

Se o render for interrompido, rode o mesmo comando de novo: ele continua de onde parou.
Testado no Blender 4.5 LTS e 5.2 LTS.
"""
import argparse
import fnmatch
import json
import math
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import caminho as cm  # noqa: E402

BLENDER5 = bpy.app.version >= (5, 0, 0)


def opcoes():
    p = argparse.ArgumentParser(prog="render_passeio.py")
    p.add_argument("--teste", action="store_true")
    p.add_argument("--quadros", type=int, default=300)
    p.add_argument("--res", default="1920x1080")
    p.add_argument("--amostras", type=int, default=128)
    p.add_argument("--cena")
    p.add_argument("--pausa", type=float, default=0.35)
    p.add_argument("--porta")
    p.add_argument("--porta-angulo", type=float, default=-100)
    p.add_argument("--porta-eixo", default="Z", choices=["X", "Y", "Z", "x", "y", "z"])
    p.add_argument("--porta-entre", type=int, nargs=2, default=[1, 2])
    p.add_argument("--clicaveis", default="")
    p.add_argument("--de", type=int, default=1)
    p.add_argument("--ate", type=int, default=0)
    p.add_argument("--saida", default="render")
    p.add_argument("--refazer", action="store_true")
    p.add_argument("--cpu", action="store_true")
    p.add_argument("--rapido", action="store_true")
    p.add_argument("--em-ordem", action="store_true")
    return p.parse_args(cm.args_depois_do_traco(sys.argv))


def usar_gpu(scene, cpu):
    scene.cycles.device = "CPU"
    if cpu:
        return "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for tipo in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = tipo
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == tipo]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == tipo
            scene.cycles.device = "GPU"
            return f"{tipo} ({', '.join(d.name for d in gpus)})"
    return "CPU (nenhuma placa de vídeo compatível encontrada)"


class Canais:
    """Canais extras (luzes e ids) gravados ao lado de cada quadro, no Blender 4 e no 5."""

    def __init__(self, scene, saida, com_ids):
        vl = scene.view_layers[0]
        vl.use_pass_emit = True
        vl.use_pass_object_index = com_ids
        self.saidas = []
        if BLENDER5:
            ng = bpy.data.node_groups.new("Passeio - canais", "CompositorNodeTree")
            ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
            rl = ng.nodes.new("CompositorNodeRLayers")
            rl.scene = scene
            ng.links.new(rl.outputs["Image"], ng.nodes.new("NodeGroupOutput").inputs[0])
            scene.compositing_node_group = ng
            emit, index = rl.outputs["Emission"], rl.outputs["Object Index"]
        else:
            scene.use_nodes = True
            ng = scene.node_tree
            ng.nodes.clear()
            rl = ng.nodes.new("CompositorNodeRLayers")
            ng.links.new(rl.outputs["Image"], ng.nodes.new("CompositorNodeComposite").inputs["Image"])
            emit, index = rl.outputs["Emit"], rl.outputs["IndexOB"]
        self._saida(ng, emit, os.path.join(saida, "luzes"), "RGB")
        if com_ids:
            div = ng.nodes.new("ShaderNodeMath" if BLENDER5 else "CompositorNodeMath")
            div.operation = "DIVIDE"
            div.inputs[1].default_value = 255.0
            ng.links.new(index, div.inputs[0])
            self._saida(ng, div.outputs[0], os.path.join(saida, "ids"), "BW")

    def _saida(self, ng, socket, pasta, cor):
        os.makedirs(pasta, exist_ok=True)
        out = ng.nodes.new("CompositorNodeOutputFile")
        fmt = out.format
        if BLENDER5:
            out.directory = pasta + os.sep
            out.file_output_items.new("FLOAT" if cor == "BW" else "RGBA", "")
            fmt.media_type = "IMAGE"
        else:
            out.base_path = pasta + os.sep
            out.file_slots[0].path = ""
        fmt.file_format = "PNG"
        fmt.color_mode = cor
        fmt.color_depth = "8"
        if cor == "BW":   # índices crus, sem curva de cor
            fmt.color_management = "OVERRIDE"
            fmt.view_settings.view_transform = "Standard"
            fmt.view_settings.exposure = 0
            fmt.view_settings.look = "None"
        ng.links.new(socket, out.inputs[0])
        self.saidas.append((out, pasta))

    def antes(self, f):
        """No Blender 5 o nome do arquivo vem daqui; no 4, do número do quadro."""
        if BLENDER5:
            for out, _ in self.saidas:
                out.file_name = f"{f:04d}"

    def depois(self, f):
        for _, pasta in self.saidas:   # o Blender 4 acrescenta o número; normaliza para 0001.png
            for nome in os.listdir(pasta):
                if nome.startswith(f"{f:04d}") and nome != f"{f:04d}.png":
                    os.replace(os.path.join(pasta, nome), os.path.join(pasta, f"{f:04d}.png"))


def camera_animada(scene):
    cam = scene.camera
    return cam if cam and cam.animation_data and cam.animation_data.action else None


def escolher_cena(nome):
    if nome:
        if nome not in bpy.data.scenes:
            raise SystemExit(f"\nERRO: não há cena '{nome}'. Cenas: {', '.join(s.name for s in bpy.data.scenes)}\n")
        return bpy.data.scenes[nome]
    atual = bpy.context.scene
    if camera_animada(atual) or len(cm.cameras_marcadas(atual)) >= 2:
        return atual
    for s in bpy.data.scenes:
        if camera_animada(s):
            return s
    return atual


def grupos_clicaveis(scene, texto):
    """[(nome, [objetos])]: cada item de --clicaveis (com * para juntar peças) e cada clique_*."""
    grupos = [(o.name, [o]) for o in scene.objects if o.type == "MESH" and o.name.lower().startswith("clique_")]
    for item in [x.strip() for x in texto.split(",") if x.strip()]:
        # o item pode ser um "pai" vazio: entram as peças dentro dele
        achados = [o for o in scene.objects if fnmatch.fnmatchcase(o.name, item)]
        objs = list({id(x): x for o in achados for x in [o, *o.children_recursive]
                     if x.type in ("MESH", "CURVE")}.values())
        if objs:
            grupos.append((item.rstrip("*. "), objs))
        else:
            print(f"AVISO: nenhum objeto corresponde a '{item}'.")
    return grupos[:254]


def main():
    op = opcoes()
    scene = escolher_cena(op.cena)
    largura, altura = (int(x) for x in op.res.lower().split("x"))
    amostras = op.amostras
    saida = os.path.abspath(op.saida)
    if op.teste:
        largura, altura, amostras = 640, round(640 * altura / largura), 24
        saida = os.path.join(saida, "teste")
    os.makedirs(os.path.join(saida, "quadros"), exist_ok=True)

    animada = camera_animada(scene)
    cams = cm.cameras_marcadas(scene)
    if animada:
        cam, dados = animada, animada.data
        f0, f1 = scene.frame_start, scene.frame_end
        modo = f"câmera animada '{cam.name}' (quadros {f0}–{f1} da cena)"

        def pose(q):
            x = f0 + q * (f1 - f0) / max(1, op.quadros - 1)
            scene.frame_set(int(x), subframe=x - int(x))
    elif len(cams) >= 2:
        caminho = cm.Caminho(cams, op.quadros, op.pausa)
        dados = bpy.data.cameras.new("Passeio")
        dados.sensor_fit = "HORIZONTAL"
        dados.sensor_width = cm.SENSOR
        dados.clip_start = min(c.data.clip_start for c in cams)
        dados.clip_end = max(c.data.clip_end for c in cams)
        cam = bpy.data.objects.new("Passeio", dados)
        scene.collection.objects.link(cam)
        scene.camera = cam
        porta = cm.achar_objeto(op.porta) if op.porta else None
        eixo = "XYZ".index(op.porta_eixo.upper())
        base = porta.rotation_euler.copy() if porta else None
        modo = f"{len(cams)} câmeras ({', '.join(caminho.nomes)})"

        def pose(q):
            m, lente = caminho.em(q)
            cam.matrix_world = m
            dados.lens = lente
            if porta:
                rot = base.copy()
                rot[eixo] += math.radians(cm.porta_angulo(caminho, q, op.porta_entre, op.porta_angulo))
                porta.rotation_euler = rot
            scene.frame_set(int(q) + 1)
    else:
        raise SystemExit(
            "\nERRO: a cena não tem câmera animada nem câmeras cam_01, cam_02…\n"
            "No Blender: Add > Camera, posicione (Ctrl+Alt+0 no teclado numérico) e renomeie (F2).\n")

    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = largura, altura, 100
    r.film_transparent = False
    r.use_motion_blur = False
    if BLENDER5:
        r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "8"
    scene.cycles.samples = amostras
    scene.cycles.use_adaptive_sampling = True
    r.use_persistent_data = True     # a cena é preparada uma vez só, não a cada quadro
    if op.rapido:
        c = scene.cycles
        c.max_bounces, c.diffuse_bounces, c.glossy_bounces = 6, 3, 2
        c.transmission_bounces, c.transparent_max_bounces, c.volume_bounces = 4, 8, 0
        c.caustics_reflective = c.caustics_refractive = False
        c.adaptive_threshold = 0.03
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    dispositivo = usar_gpu(scene, op.cpu)

    grupos = grupos_clicaveis(scene, op.clicaveis)
    for o in scene.objects:
        o.pass_index = 0
    for i, (_, objs) in enumerate(grupos, start=1):
        for o in objs:
            o.pass_index = i
    canais = Canais(scene, saida, bool(grupos))

    # camera.json: todo o caminho (sai antes do render, para já testar o site)
    matrizes, fovs = [], []
    for q in range(op.quadros):
        pose(q)
        matrizes.append(cm.para_three(cam.matrix_world))
        fovs.append(round(cm.fov_da_camera(dados, largura, altura), 4))
    vistas = {}
    if not animada:
        vistas = {n: caminho.vista(n) + 1 for n in caminho.nomes}
    pontos = [{"nome": o.name, "pos": cm.ponto_three(o.matrix_world.to_translation())}
              for o in scene.objects if o.type == "EMPTY" and o.name.lower().startswith("ponto_")]
    info = {
        "versao": 1, "quadros": op.quadros, "largura": largura, "altura": altura,
        "coordenadas": "metros, Y para cima (three.js); matrizes coluna a coluna",
        "fov": fovs, "matrizes": matrizes, "vistas": vistas,
        "clicaveis": [{"nome": nome, "indice": i, "centro": cm.ponto_three(cm.centro_de(objs))}
                      for i, (nome, objs) in enumerate(grupos, start=1)],
        "pontos": pontos,
    }
    with open(os.path.join(saida, "camera.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False)

    if op.teste:
        lista = sorted({round(i * (op.quadros - 1) / 11) + 1 for i in range(12)})
    else:
        ate = op.ate or op.quadros
        lista = list(range(max(1, op.de), min(op.quadros, ate) + 1))
        if not op.em_ordem:
            # do mais espaçado ao mais fino (1 a cada 32, 16, 8…): a qualquer momento já existe
            # o passeio inteiro, com menos quadros — o site mostra o vizinho mais próximo
            ordem, visto = [], set()
            for passo in (32, 16, 8, 4, 2, 1):
                for f in lista[::passo]:
                    if f not in visto:
                        visto.add(f)
                        ordem.append(f)
            lista = ordem
    print(f"\nCena '{scene.name}': {modo}; {op.quadros} quadros, {largura}x{altura}, {amostras} amostras, {dispositivo}.")
    print(f"Clicáveis: {', '.join(n for n, _ in grupos) or 'nenhum'}. Saída: {saida}\n")

    feitos, t0 = 0, time.time()
    for n, f in enumerate(lista, start=1):
        arquivo = os.path.join(saida, "quadros", f"{f:04d}.png")
        if os.path.exists(arquivo) and not op.refazer:
            continue
        pose(f - 1)
        canais.antes(f)
        r.filepath = arquivo
        bpy.ops.render.render(write_still=True, scene=scene.name)
        canais.depois(f)
        feitos += 1
        seg = (time.time() - t0) / feitos
        resta = sum(1 for g in lista[n:] if op.refazer or not os.path.exists(os.path.join(saida, "quadros", f"{g:04d}.png")))
        print(f"quadro {f:04d} ({n}/{len(lista)}) — {seg:.1f} s por quadro, faltam ~{resta * seg / 60:.0f} min", flush=True)
    print(f"\nPronto: {saida}\n")


main()
