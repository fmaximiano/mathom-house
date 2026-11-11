"""
Exporta a toca do Blender para glTF (.glb), para o passeio em 3D em tempo real (modelo.html).

Uso (num terminal, na pasta onde está o toca.blend):
    blender -b toca.blend -P caminho/para/exportar_glb.py -- [opções]

Opções (todas opcionais):
    --saida toca.glb        arquivo gerado (depois copie para assets/modelo/toca.glb), e o céu ao lado
                            (toca-ceu.hdr, uma foto 360° do World da cena)
    --cena "Nome"           a cena a exportar (padrão: a que tem câmera animada, se houver)
    --clicaveis "a*,b"      objetos clicáveis (como no render_passeio.py; * junta peças)
    --textura-max 2048      reduz texturas maiores que isso (em pixels)
    --luz-max 2048          tamanho máximo dos mapas de luz (luz assada) no site
    --qualidade 85          qualidade das texturas (WebP)
    --sem-draco             não comprime a geometria (arquivo maior, carrega mais rápido na CPU)
    --sem-juntar            não junta os objetos (milhares de objetos = navegador lento)
    --porta NOME …          (câmeras cam_XX) a porta que se abre, como no render_passeio.py
    --quadros 300 --pausa 0.35

O que vai no arquivo:
  - a geometria, com os objetos fixos juntados por material (de milhares para dezenas de
    malhas — cada malha é uma chamada de desenho no navegador);
  - separados: o que é animado (a porta), os clicáveis (clique_<nome>), câmeras e luzes;
  - a câmera animada do passeio (ou as câmeras cam_01, cam_02…), com a animação;
  - as luzes pontuais e o sol; as luzes de área (que o glTF não tem) viram marcadores
    "area_*" que o site transforma em luzes retangulares;
  - as cores feitas com nós (ruído, rampa de cor…), que o glTF não entende, guardadas nos
    vértices com um bake rápido do Cycles;
  - se o .blend já tem a luz assada (objetos com luz_mapa / luz_vertices, ver LEIAME), os mapas
    de luz viram luz/<nome>.png ao lado do .glb e a luz dos vértices vai junto no .glb;
  - os vazios "ponto_*".
E o céu (World) vira uma imagem 360° à parte, para o fundo e os reflexos.
O .blend não é alterado (nada é salvo).
"""
import argparse
import fnmatch
import math
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import caminho as cm  # noqa: E402


def opcoes():
    p = argparse.ArgumentParser(prog="exportar_glb.py")
    p.add_argument("--saida", default="toca.glb")
    p.add_argument("--cena")
    p.add_argument("--clicaveis", default="")
    p.add_argument("--textura-max", type=int, default=2048)
    p.add_argument("--luz-max", type=int, default=2048)
    p.add_argument("--qualidade", type=int, default=85)
    p.add_argument("--sem-draco", action="store_true")
    p.add_argument("--sem-juntar", action="store_true")
    p.add_argument("--porta")
    p.add_argument("--porta-angulo", type=float, default=-100)
    p.add_argument("--porta-eixo", default="Z", choices=["X", "Y", "Z", "x", "y", "z"])
    p.add_argument("--porta-entre", type=int, nargs=2, default=[1, 2])
    p.add_argument("--quadros", type=int, default=300)
    p.add_argument("--pausa", type=float, default=0.35)
    return p.parse_args(cm.args_depois_do_traco(sys.argv))


def escolher_cena(nome):
    if nome:
        return bpy.data.scenes[nome]
    for s in [bpy.context.scene, *bpy.data.scenes]:
        c = s.camera
        if c and c.animation_data and c.animation_data.action:
            return s
    return bpy.context.scene


def animado(o):
    """O objeto (ou um pai dele) se move durante o passeio."""
    while o:
        if o.animation_data and o.animation_data.action:
            return True
        o = o.parent
    return False


def ctx(scene, objs, ativo):
    return bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0],
                                     selected_objects=objs, selected_editable_objects=objs,
                                     active_object=ativo, object=ativo)


def juntar(scene, objs, nome):
    """Aplica modificadores, converte curvas e junta num objeto só (na posição do mundo)."""
    objs = [o for o in objs if o.type in ("MESH", "CURVE") and not o.hide_render]
    if not objs:
        return None
    with ctx(scene, objs, objs[0]):
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.convert(target="MESH")
    objs = [o for o in objs if o.name in scene.objects and o.type == "MESH"]
    if len(objs) > 1:
        with ctx(scene, objs, objs[0]):
            bpy.ops.object.join()
    objs[0].name = nome
    return objs[0]


def separar_por_material(scene, obj):
    scene.view_layers[0].objects.active = obj
    with ctx(scene, [obj], obj):
        bpy.ops.object.mode_set(mode="EDIT")
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0], active_object=obj,
                                   object=obj, edit_object=obj, selected_objects=[obj]):
        bpy.ops.mesh.separate(type="MATERIAL")
    with ctx(scene, [obj], obj):
        bpy.ops.object.mode_set(mode="OBJECT")
    partes = [o for o in scene.objects if o.type == "MESH" and (o == obj or o.name.startswith(obj.name + "."))]
    for o in partes:
        mat = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else "sem material"
        o.name = f"toca | {mat}"
    return partes


COR = "cor_assada"


def procedural(mat):
    """A cor do material é calculada por nós (ruído, rampa…): o glTF não leva isso. Uma imagem ou uma cor
    de vértice ligada direto na Base Color o glTF entende."""
    if not mat or not mat.node_tree:
        return False
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeBsdfPrincipled" and n.inputs["Base Color"].is_linked:
            fonte = n.inputs["Base Color"].links[0].from_node
            return fonte.bl_idname not in ("ShaderNodeTexImage", "ShaderNodeVertexColor", "ShaderNodeAttribute")
    return False


def assar_cores(scene, visiveis):
    """Guarda a cor dos materiais procedurais nos vértices (bake do Cycles) e troca os nós por ela."""
    mats = {m for m in bpy.data.materials if procedural(m)}
    objs = [o for o in visiveis if o.type in ("MESH", "CURVE") and not o.hide_render
            and any(s.material in mats for s in o.material_slots)]
    if not objs:
        return 0
    print(f"Guardando a cor de {len(mats)} materiais procedurais em {len(objs)} objetos…", flush=True)
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
    with ctx(scene, objs, objs[0]):
        bpy.ops.object.convert(target="MESH")          # aplica modificadores; curvas viram malha
    objs = [o for o in objs if o.type == "MESH"]
    for o in objs:
        attrs = o.data.color_attributes
        attrs.active_color = attrs.get(COR) or attrs.new(COR, "BYTE_COLOR", "CORNER")
    # numa cena só com esses objetos, o Cycles prepara tudo bem mais rápido (a cor não depende da luz)
    temp = bpy.data.scenes.new("assar cores")
    temp.render.engine = "CYCLES"
    temp.cycles.samples = 1
    temp.cycles.device = "CPU"
    for o in objs:
        temp.collection.objects.link(o)
    t = time.time()
    for i in range(0, len(objs), 200):
        lote = objs[i:i + 200]
        with ctx(temp, lote, lote[0]):
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, target="VERTEX_COLORS", use_clear=True)
        print(f"  {min(i + 200, len(objs))}/{len(objs)} ({time.time() - t:.0f} s)", flush=True)
    bpy.data.scenes.remove(temp)
    for m in mats:
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"]:
            cor = nt.nodes.new("ShaderNodeVertexColor")
            cor.layer_name = COR
            nt.links.new(cor.outputs["Color"], n.inputs["Base Color"])
    return len(objs)


def ajustar_normais(mat):
    """O glTF só entende mapa de normais: o relevo por altura (nó Bump) sai e fica o Normal Map
    que estiver por baixo dele. (Sem isso, o exportador manda a textura de altura como se fosse de
    normais e a iluminação vira uma camuflagem.)"""
    nt = mat.node_tree if mat else None
    for n in (nt.nodes if nt else []):
        if n.bl_idname != "ShaderNodeBsdfPrincipled" or not n.inputs["Normal"].is_linked:
            continue
        origem = n.inputs["Normal"].links[0].from_node
        while origem is not None and origem.bl_idname == "ShaderNodeBump":
            baixo = origem.inputs["Normal"]
            origem = baixo.links[0].from_node if baixo.is_linked else None
        if origem is n.inputs["Normal"].links[0].from_node:
            continue
        nt.links.remove(n.inputs["Normal"].links[0])
        if origem is not None and origem.bl_idname == "ShaderNodeNormalMap":
            nt.links.new(origem.outputs["Normal"], n.inputs["Normal"])


# Os mapas de luz (luz assada no Blender, em EXR) viram PNG de 8 bits com uma curva logarítmica,
# que guarda bem tanto a penumbra quanto o clarão perto das lanternas. O site desfaz a curva:
#   luz = K · (2^(valor · log2(1 + MAXIMO/K)) − 1)
LUZ_K, LUZ_MAXIMO = 0.02, 64.0


def mapas_de_luz(scene, pasta, lado_max):
    """Converte as imagens citadas em luz_mapa (EXR) para pasta/luz/<nome>.png. Devolve os nomes."""
    import numpy as np
    nomes = sorted({o["luz_mapa"] for o in scene.objects if o.get("luz_mapa")})
    os.makedirs(os.path.join(pasta, "luz"), exist_ok=True)
    escala = math.log2(1 + LUZ_MAXIMO / LUZ_K)
    for nome in nomes:
        img = bpy.data.images.get(nome)
        if img is None:
            raise SystemExit(f"\nERRO: o objeto pede o mapa de luz '{nome}', mas essa imagem não está no .blend.\n")
        w, h = img.size
        if max(w, h) > lado_max:
            img = img.copy()
            k = lado_max / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))
            w, h = img.size
        px = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        cod = np.log2(1 + np.clip(px[:, :3], 0, LUZ_MAXIMO) / LUZ_K) / escala
        saida = bpy.data.images.new(f"web_{nome}", w, h, alpha=False, float_buffer=False)
        saida.colorspace_settings.name = "Non-Color"
        buf = np.ones((w * h, 4), np.float32)
        buf[:, :3] = cod
        saida.pixels.foreach_set(buf.ravel())
        saida.filepath_raw = os.path.join(pasta, "luz", nome + ".png")
        saida.file_format = "PNG"
        saida.save()
        acesos = px[:, :3].max(1)
        acesos = acesos[acesos > 1e-3]
        TIPICA[nome] = float(np.median(acesos)) if len(acesos) else 0.1
        print(f"  mapa de luz {nome}: {w}×{h}, até {px[:, :3].max():.1f}, típica {TIPICA[nome]:.3f}", flush=True)
    scene["luz_codificacao"] = {"tipo": "log2", "k": LUZ_K, "maximo": LUZ_MAXIMO, "pasta": "luz"}
    return nomes


TIPICA = {}     # luz típica (mediana) de cada mapa de luz, para socorrer a luz dos vértices


def preencher_luz(me, cor, sala):
    """No bake para os vértices, pontos enfiados em outra geometria (onde pétalas e folhas se cruzam)
    saem pretos. Preenche esses pontos com a média dos vizinhos acesos; se a malha inteira falhou,
    usa a luz típica do cômodo."""
    import numpy as np
    apagado = cor[:, :3].max(1) < 1e-4
    if not apagado.any():
        return cor
    arestas = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", arestas)
    a, b = arestas[0::2], arestas[1::2]
    for _ in range(12):
        if not apagado.any():
            break
        soma = np.zeros((len(cor), 3))
        n = np.zeros(len(cor))
        for x, y in ((a, b), (b, a)):
            ok = ~apagado[y]
            np.add.at(soma, x[ok], cor[y[ok], :3])
            np.add.at(n, x[ok], 1)
        novos = apagado & (n > 0)
        cor[novos, :3] = soma[novos] / n[novos, None]
        apagado &= ~novos
    if apagado.any():
        acesos = cor[~apagado, :3]
        if len(acesos) > 0.2 * len(cor):
            cor[apagado, :3] = np.median(acesos, axis=0)
        else:
            cor[:, :3] = TIPICA.get(f"luz_{sala}", 0.1) if sala else 0.1
    return cor


def luz_nos_vertices(scene):
    """A luz assada nos vértices (atributo "Luz") vai para o glTF como atributo próprio (_LUZ)."""
    import numpy as np
    feitos = 0
    for o in [o for o in scene.objects if o.type == "MESH" and o.get("luz_vertices")]:
        a = o.data.color_attributes.get(o.get("luz_uv", "Luz")) or o.data.color_attributes.get("Luz")
        if a is None:
            continue
        novo = o.data.attributes.get("_LUZ") or o.data.attributes.new("_LUZ", "FLOAT_COLOR", a.domain)
        buf = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get("color", buf)
        novo.data.foreach_set("color", buf)
        feitos += 1
    return feitos


def enxugar_vertices(scene):
    """Cores guardadas por canto de triângulo fazem o glTF duplicar cada vértice. Nas malhas com cor ou
    luz nos vértices, passa para um valor por vértice (a média dos cantos) e tira o mapa UV que nenhum
    material usa (sem textura de imagem)."""
    import numpy as np
    enxutas = 0
    for o in [o for o in scene.objects if o.type == "MESH"]:
        me = o.data
        nomes = [n for n in ("_LUZ", COR) if n in me.attributes and me.attributes[n].domain == "CORNER"]
        if not nomes:
            continue
        vi = np.empty(len(me.loops), np.int64)
        me.loops.foreach_get("vertex_index", vi)
        cont = np.maximum(np.bincount(vi, minlength=len(me.vertices)), 1)[:, None]
        for nome in nomes:
            a = me.attributes[nome]
            tipo = a.data_type
            buf = np.empty(len(me.loops) * 4, np.float32)
            a.data.foreach_get("color", buf)
            buf = buf.reshape(-1, 4)
            if nome == "_LUZ":
                # só os cantos acesos entram na média (os pretos são falha do bake, não sombra)
                aceso = buf[:, :3].max(1) >= 1e-4
                soma = np.zeros((len(me.vertices), 4), np.float64)
                np.add.at(soma, vi[aceso], buf[aceso])
                n = np.bincount(vi[aceso], minlength=len(me.vertices))[:, None]
                media = preencher_luz(me, soma / np.maximum(n, 1), o.get("web_sala"))
                # em peças finas e emboladas (caules, copas fechadas) o bake nos vértices sai escuro
                # demais: cada ponto recebe pelo menos a luz típica da própria malha (ao ar livre, a dos
                # 25% mais claros, porque as copas das árvores são blocos fechados)
                brilho = media[:, :3].max(1)
                piso = np.percentile(brilho, 75 if "exterior" in str(o.get("web_sala", "")) else 60)
                fraco = (brilho < piso) & (brilho > 1e-6)
                media[fraco, :3] *= (piso / brilho[fraco])[:, None]
            else:
                soma = np.zeros((len(me.vertices), 4), np.float64)
                np.add.at(soma, vi, buf)
                media = soma / cont
            me.attributes.remove(a)
            novo = me.attributes.new(nome, tipo, "POINT")
            novo.data.foreach_set("color", media.astype(np.float32).ravel())
        usa_imagem = any(sl.material and sl.material.node_tree and any(n.bl_idname == "ShaderNodeTexImage"
                         for n in sl.material.node_tree.nodes) for sl in o.material_slots)
        if not usa_imagem:
            for uv in [uv for uv in me.uv_layers if uv.name != o.get("luz_uv")]:
                me.uv_layers.remove(uv)
        enxutas += 1
    return enxutas


def emprestar_luz(scene):
    """Em peças finas e emboladas (caules, pétalas, miolos de flor) o bake nos vértices só enxerga a luz
    rasante e sai escuro e alaranjado, enquanto no render elas brilham como as folhas ao lado. Cada ponto
    da vegetação recebe pelo menos a luz das partes mais claras em volta (os 20% mais claros num raio de
    30 cm, somando todas as malhas com luz nos vértices)."""
    import numpy as np
    from mathutils import kdtree
    objs = [o for o in scene.objects if o.type == "MESH" and "_LUZ" in o.data.attributes
            and o.data.attributes["_LUZ"].domain == "POINT"]
    if not objs:
        return 0
    pontos, luzes = [], []
    for o in objs:
        me = o.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        mw = np.array(o.matrix_world)
        pontos.append(co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3])
        cor = np.empty(len(me.vertices) * 4, np.float32)
        me.attributes["_LUZ"].data.foreach_get("color", cor)
        luzes.append(cor.reshape(-1, 4))
    todos, todas = np.concatenate(pontos), np.concatenate(luzes)
    brilho = todas[:, :3].max(1)
    # peças miúdas (pétalas, miolos) procuram luz nas OUTRAS malhas em volta (folhas): entre si, os
    # vizinhos estariam tão escuros quanto elas
    MIUDA = 3000
    dono = np.concatenate([np.full(len(c), i) for i, c in enumerate(pontos)])
    arvore = kdtree.KDTree(len(todos))
    for k, c in enumerate(todos):
        arvore.insert(c, k)
    arvore.balance()
    mudadas, inicio = 0, 0
    for i, (o, co, cor) in enumerate(zip(objs, pontos, luzes)):
        novo = cor.copy()
        miuda = len(co) < MIUDA
        for k in range(len(co)):
            if miuda:
                perto = [j for _, j, _d in arvore.find_range(co[k], 0.35) if dono[j] != i][:400]
            else:
                perto = [j for _, j, d in arvore.find_n(co[k], 32) if d < 0.3]
            if len(perto) < 4:
                continue
            b = brilho[perto]
            limite = np.percentile(b, 80)
            if brilho[inicio + k] < limite:
                claros = [j for j, x in zip(perto, b) if x >= limite]
                novo[k, :3] = todas[claros, :3].mean(0)
        if not np.array_equal(novo, cor):
            o.data.attributes["_LUZ"].data.foreach_set("color", novo.ravel())
            mudadas += 1
        inicio += len(co)
    return mudadas


def corrigir_luzes(scene):
    """O exportador lê a força do sol no nó Emission (e ignora a potência): junta as duas."""
    for luz in [o for o in scene.objects if o.type == "LIGHT" and o.data.type != "AREA"]:
        d = luz.data
        for n in (d.node_tree.nodes if d.node_tree else []):
            if n.bl_idname == "ShaderNodeEmission" and not n.inputs["Strength"].is_linked:
                forca = n.inputs["Strength"].default_value
                if d.type == "SUN":
                    n.inputs["Strength"].default_value = d.energy * forca
                else:
                    d.energy *= forca
                    n.inputs["Strength"].default_value = 1.0


def transparente(obj, face):
    """O raio atravessa (vidro): material com transmissão."""
    if not obj.material_slots or face < 0 or face >= len(obj.data.polygons):
        return False
    m = obj.material_slots[obj.data.polygons[face].material_index].material
    for n in (m.node_tree.nodes if m and m.node_tree else []):
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            t = n.inputs.get("Transmission Weight") or n.inputs.get("Transmission")
            return bool(t) and not t.is_linked and t.default_value > 0.5
    return False


def ceu_visivel(scene, posicoes, raios=96):
    """Quanto do céu se vê de cada posição (0 = fechado, 1 = céu aberto). No site, a luz ambiente
    (o céu refletido) acompanha isso: forte lá fora, fraca dentro da toca — o que o Cycles faz com
    a luz rebatida e o navegador não sabe fazer sozinho."""
    deps = scene.view_layers[0].depsgraph
    dirs = []
    for i in range(raios):                      # hemisfério de cima, pesado pelo cosseno (espiral)
        z = math.sqrt(1 - (i + 0.5) / raios)
        r, a = math.sqrt(1 - z * z), i * 2.39996
        dirs.append(cm.Vector((r * math.cos(a), r * math.sin(a), z)))
    valores = []
    for p in posicoes:
        livres = 0
        for d in dirs:
            o = p
            for _ in range(6):
                hit, loc, _n, face, obj, _m = scene.ray_cast(deps, o, d, distance=200)
                if not hit:
                    livres += 1
                    break
                if not transparente(obj, face):
                    break
                o = loc + d * 0.002
        valores.append(round(livres / raios, 3))
    return valores


def assar_ceu(scene, arquivo, largura=1024):
    """Renderiza o céu (World) numa imagem panorâmica .hdr, para o fundo e o reflexo no site."""
    if not scene.world:
        return None
    ceu = bpy.data.scenes.new("ceu para o site")
    ceu.world = scene.world
    dados = bpy.data.cameras.new("ceu")
    dados.type = "PANO"
    for alvo in (dados, getattr(dados, "cycles", None)):
        if alvo is not None and hasattr(alvo, "panorama_type"):
            alvo.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("ceu", dados)
    ceu.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))   # centro da imagem = +X, como o three.js espera
    ceu.camera = cam
    r = ceu.render
    r.engine = "CYCLES"
    ceu.cycles.samples = 16
    ceu.cycles.use_denoising = False
    r.resolution_x, r.resolution_y, r.resolution_percentage = largura, largura // 2, 100
    fmt = r.image_settings
    if hasattr(fmt, "media_type"):
        fmt.media_type = "IMAGE"
    fmt.file_format = "HDR"
    r.filepath = arquivo
    bpy.ops.render.render(write_still=True, scene=ceu.name)
    return arquivo


def main():
    op = opcoes()
    scene = escolher_cena(op.cena)
    cams = cm.cameras_marcadas(scene)
    cam_anim = scene.camera if scene.camera and scene.camera.animation_data and scene.camera.animation_data.action else None
    print(f"\nCena '{scene.name}': {len(scene.objects)} objetos"
          + (f", câmera animada '{cam_anim.name}'" if cam_anim else f", {len(cams)} câmeras cam_XX"))

    # a porta (câmeras cam_XX): uma animação "passeio" do tamanho do caminho
    if op.porta and len(cams) >= 2 and not cam_anim:
        porta = cm.achar_objeto(op.porta)
        caminho = cm.Caminho(cams, op.quadros, op.pausa)
        eixo = "XYZ".index(op.porta_eixo.upper())
        base = porta.rotation_euler.copy()
        porta.animation_data_clear()
        scene.render.fps = 30
        scene.frame_start, scene.frame_end = 1, op.quadros
        for f in range(1, op.quadros + 1, 3):
            rot = base.copy()
            rot[eixo] += math.radians(cm.porta_angulo(caminho, f - 1, op.porta_entre, op.porta_angulo))
            porta.rotation_euler = rot
            porta.keyframe_insert("rotation_euler", frame=f)
        porta.animation_data.action.name = "passeio"
        porta.rotation_euler = base
    if cam_anim:
        cam_anim.animation_data.action.name = "passeio"

    # exposição e tom do Blender, para o site começar igual
    scene["exposicao"] = scene.view_settings.exposure
    scene["transformacao"] = scene.view_settings.view_transform
    corrigir_luzes(scene)

    # luzes de área -> marcadores (o glTF só tem luz pontual, spot e sol)
    for luz in [o for o in scene.objects if o.type == "LIGHT" and o.data.type == "AREA"]:
        d = luz.data
        m = luz.matrix_world
        frente = (m.to_3x3() @ cm.Vector((0, 0, -1))).normalized()
        e = bpy.data.objects.new(f"area_{luz.name}", None)
        scene.collection.objects.link(e)
        e.location = m.to_translation()
        e["area_dir"] = cm.ponto_three(frente)
        e["area_largura"] = d.size
        e["area_altura"] = d.size if d.shape in ("SQUARE", "DISK") else d.size_y
        e["area_energia"] = d.energy
        e["area_cor"] = list(d.color)
        e["area_disco"] = d.shape in ("DISK", "ELLIPSE")
        e["area_reflexo"] = luz.visible_glossy

    visiveis = scene.view_layers[0].objects
    assadas = assar_cores(scene, visiveis)

    # clicáveis: cada grupo vira um objeto clique_<nome> (cada peça entra num grupo só)
    moveis = {o.name for o in visiveis if animado(o)}
    usados = set()
    grupos = []
    pedidos = [(o.name[len("clique_"):], [o]) for o in visiveis if o.type == "MESH" and o.name.lower().startswith("clique_")]
    for item in [x.strip() for x in op.clicaveis.split(",") if x.strip()]:
        achados = [o for o in visiveis if fnmatch.fnmatchcase(o.name, item)]
        pedidos.append((item.rstrip("*. "), [x for o in achados for x in [o, *o.children_recursive]]))
    for nome, objs in pedidos:
        objs = [o for o in objs if o.type in ("MESH", "CURVE") and o.name in visiveis and o.name not in usados]
        usados.update(o.name for o in objs)
        if not objs:
            print(f"AVISO: nenhum objeto corresponde a '{nome}'.")
        # com luz assada, cada pedaço usa o mapa do seu cômodo: só se juntam pedaços do mesmo mapa
        por_mapa = {}
        for o in objs:
            por_mapa.setdefault(o.get("luz_mapa"), []).append(o.name)
        for i, nomes in enumerate(por_mapa.values()):
            grupos.append((nome if i == 0 else f"{nome}_{i + 1}", nomes))

    # já otimizado no Blender (juntado por cômodo e material, com a luz assada): só os clicáveis se juntam
    otimizado = bool(scene.get("web_otimizado"))
    if not op.sem_juntar:
        for nome, nomes in grupos:
            if not moveis & set(nomes):
                junto = juntar(scene, [bpy.data.objects[n] for n in nomes], f"clique_{nome}")
                usados.add(junto.name)
    if not op.sem_juntar and not otimizado:
        fixos = [o for o in visiveis if o.type in ("MESH", "CURVE") and o.name not in usados
                 and o.name not in moveis and not o.hide_render]
        print(f"Juntando {len(fixos)} objetos fixos…", flush=True)
        tudo = juntar(scene, fixos, "toca")
        partes = separar_por_material(scene, tudo) if tudo else []
        print(f"  → {len(partes)} malhas (uma por material)")
        # vazios que só agrupavam peças já juntadas
        for o in [o for o in scene.objects if o.type == "EMPTY" and not o.children and o.name not in moveis
                  and not o.name.startswith(("area_", "ponto_"))]:
            bpy.data.objects.remove(o)

    for m in bpy.data.materials:
        ajustar_normais(m)

    # quanto céu a câmera vê ao longo do passeio (para dosar a luz ambiente no site)
    if cam_anim:
        f0, f1 = scene.frame_start, scene.frame_end
        posicoes = []
        for i in range(121):
            x = f0 + i * (f1 - f0) / 120
            scene.frame_set(int(x), subframe=x - int(x))
            posicoes.append(cam_anim.matrix_world.to_translation())
        scene.frame_set(f0)
        cam_anim["ceu_visivel"] = ceu_visivel(scene, posicoes)
    elif len(cams) >= 2:
        caminho = cm.Caminho(cams, op.quadros, op.pausa)
        posicoes = [caminho.em(i * (op.quadros - 1) / 120)[0].to_translation() for i in range(121)]
        cams[0]["ceu_visivel"] = ceu_visivel(scene, posicoes)

    # luz assada no Blender (mapas por cômodo e luz nos vértices)
    saida = os.path.abspath(op.saida)
    mapas = mapas_de_luz(scene, os.path.dirname(saida), op.luz_max) if any(o.get("luz_mapa") for o in scene.objects) else []
    com_luz_vertices = luz_nos_vertices(scene)
    enxugar_vertices(scene)
    emprestadas = emprestar_luz(scene)

    # texturas grandes demais pesam no celular
    reduzidas = 0
    for img in bpy.data.images:
        if img.name in mapas or img.name.startswith("web_"):
            continue
        w, h = img.size
        if max(w, h) > op.textura_max and img.has_data:
            k = op.textura_max / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))
            reduzidas += 1

    deps = scene.view_layers[0].depsgraph
    tri = malhas = 0
    for o in scene.objects:
        if o.type in ("MESH", "CURVE") and not o.hide_render:
            me = o.evaluated_get(deps).to_mesh()
            if me:
                me.calc_loop_triangles()
                tri += len(me.loop_triangles)
                malhas += 1
            o.evaluated_get(deps).to_mesh_clear()

    kw = dict(
        filepath=saida, export_format="GLB", export_yup=True, export_apply=True,
        use_active_scene=True, use_renderable=True,
        export_cameras=True, export_lights=True, export_animations=True,
        # luzes na escala que o three.js espera (a "física" do exportador estoura o sol)
        export_import_convert_lighting_mode="COMPAT",
        export_image_format="WEBP", export_image_quality=op.qualidade,
        export_draco_mesh_compression_enable=not op.sem_draco, export_draco_mesh_compression_level=10,
        # as malhas juntadas cobrem a casa inteira (e as texturas se repetem muitas vezes):
        # a compressão precisa de mais precisão, senão as texturas "quadriculam"
        export_draco_position_quantization=15, export_draco_texcoord_quantization=16,
        # só as cores de vértice que algum material usa (o modelo pode ter outras, que o Cycles ignora
        # mas o navegador multiplicaria pelas texturas)
        export_vertex_color="MATERIAL", export_all_vertex_colors=False,
        export_extras=True, export_attributes=True,
    )
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(**kw)
    imagens = len([i for i in bpy.data.images if i.type == "IMAGE" and i.users])
    ceu = assar_ceu(scene, os.path.splitext(saida)[0] + "-ceu.hdr")
    mb = os.path.getsize(saida) / 1e6
    print(f"\nExportado: {saida} ({mb:.1f} MB)" + (f" e o céu em {ceu}" if ceu else ""))
    print(f"  {tri:,} triângulos em {malhas} malhas".replace(",", ".")
          + f", {imagens} imagens ({reduzidas} reduzidas para {op.textura_max} px),"
          f" {assadas} objetos com a cor guardada nos vértices,"
          f" {len(mapas)} mapas de luz, {com_luz_vertices} malhas com luz nos vértices"
          f" ({emprestadas} com luz reforçada pela vizinhança),"
          f" clicáveis: {', '.join(n for n, _ in grupos) or 'nenhum'}")
    if tri > 1_500_000:
        print("  AVISO: mais de 1,5 milhão de triângulos — pode ficar pesado no celular (use Decimate nos objetos distantes).")
    if mb > 60:
        print("  AVISO: arquivo grande — tente --textura-max 1024.")
    print("Copie para assets/modelo/toca.glb e abra http://localhost:8000/modelo.html\n")


main()
