"""
O caminho da câmera pela toca, compartilhado por render_passeio.py e exportar_glb.py.

O passeio passa pelas câmeras que você posiciona no Blender, na ordem do nome:
cam_01, cam_02, cam_03… (também valem Cam_1, cam02). Entre elas, a câmera anda numa
curva suave (Catmull-Rom), mantendo o horizonte reto, com velocidade parecida em todo
o trajeto e um leve "respiro" ao passar por cada câmera marcada.
"""
import math
import re

import bpy
from mathutils import Matrix, Vector

NOME_CAM = re.compile(r"^cam[_\-. ]?(\d+)$", re.I)
UP = Vector((0, 0, 1))
SENSOR = 36.0                 # sensor horizontal da câmera do passeio (mm)
Z_PARA_Y = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))   # Blender (Z para cima) -> three.js


def cameras_marcadas(scene):
    cams = []
    for o in scene.objects:
        m = NOME_CAM.match(o.name)
        if o.type == "CAMERA" and m:
            cams.append((int(m.group(1)), o))
    return [o for _, o in sorted(cams, key=lambda x: x[0])]


def lente_equivalente(cam):
    """Distância focal equivalente num sensor horizontal de 36 mm (para interpolar)."""
    d = cam.data
    if d.type != "PERSP":
        return 35.0
    largura = d.sensor_height * 16 / 9 if d.sensor_fit == "VERTICAL" else d.sensor_width
    return d.lens * SENSOR / max(largura, 1e-3)


def _catmull(p0, p1, p2, p3, u):
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


class Caminho:
    def __init__(self, cams, quadros=300, pausa=0.35, alcance=None):
        if len(cams) < 2:
            raise ValueError("são necessárias pelo menos duas câmeras cam_01, cam_02…")
        self.nomes = [c.name for c in cams]
        self.P = [c.matrix_world.to_translation() for c in cams]
        fwd = [(c.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized() for c in cams]
        passos = [(self.P[i + 1] - self.P[i]).length for i in range(len(cams) - 1)]
        self.alcance = alcance or max(1.5, sum(passos) / len(passos))
        self.L = [p + f * self.alcance for p, f in zip(self.P, fwd)]
        self.lente = [lente_equivalente(c) for c in cams]
        # quadros por trecho, proporcionais ao comprimento (e ao quanto a câmera gira)
        peso = [passos[i] + fwd[i].angle(fwd[i + 1]) * 1.0 + 0.05 for i in range(len(passos))]
        tot = sum(peso)
        self.quadros = quadros
        self.inicio = [0.0]
        for w in peso:
            self.inicio.append(self.inicio[-1] + w / tot * (quadros - 1))
        self.pausa = pausa

    def vista(self, nome):
        """Quadro (0 = primeiro) em que o passeio passa exatamente pela câmera marcada."""
        return round(self.inicio[self.nomes.index(nome)])

    def em(self, q):
        """Pose no quadro q (0..quadros-1, pode ser fracionário): (matriz 4x4 de mundo, lente mm)."""
        n = len(self.P)
        i = 0
        while i < n - 2 and q >= self.inicio[i + 1]:
            i += 1
        u = (q - self.inicio[i]) / max(1e-9, self.inicio[i + 1] - self.inicio[i])
        u = min(1.0, max(0.0, u))
        u = u * (1 - self.pausa) + (u * u * (3 - 2 * u)) * self.pausa   # respiro nas câmeras marcadas
        idx = [max(0, i - 1), i, i + 1, min(n - 1, i + 2)]
        pos = _catmull(*[self.P[k] for k in idx], u)
        alvo = _catmull(*[self.L[k] for k in idx], u)
        lente = self.lente[i] + (self.lente[i + 1] - self.lente[i]) * (u * u * (3 - 2 * u))
        frente = (alvo - pos).normalized()
        direita = frente.cross(UP)
        if direita.length < 1e-6:
            direita = Vector((1, 0, 0))
        direita.normalize()
        cima = direita.cross(frente)
        rot = Matrix((direita, cima, -frente)).transposed()   # colunas: x, y, z da câmera
        m = rot.to_4x4()
        m.translation = pos
        return m, lente


def fov_vertical(lente, aspecto):
    return 2 * math.degrees(math.atan(SENSOR / 2 / lente / aspecto))


def para_three(m):
    """Matriz de mundo do Blender -> lista de 16 números (coluna a coluna) em Y para cima."""
    t = Z_PARA_Y @ m
    return [round(t[r][c], 6) for c in range(4) for r in range(4)]


def ponto_three(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def porta_angulo(caminho, q, entre, angulo):
    """Ângulo da porta no quadro q: abre entre as câmeras `entre` (ex.: (1, 2)), de 15% a 60% do trecho."""
    a, b = caminho.inicio[entre[0] - 1], caminho.inicio[entre[1] - 1]
    x = (q - (a + 0.15 * (b - a))) / max(1e-6, 0.45 * (b - a))
    x = min(1.0, max(0.0, x))
    return angulo * x * x * (3 - 2 * x)


def args_depois_do_traco(argv):
    return argv[argv.index("--") + 1:] if "--" in argv else []


def clicaveis(scene, nomes_extra):
    objs = [o for o in scene.objects if o.type == "MESH" and (o.name.lower().startswith("clique_") or o.name in nomes_extra)]
    faltando = [n for n in nomes_extra if n not in scene.objects]
    return objs, faltando


def centro(obj):
    cantos = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return sum(cantos, Vector()) / 8


def achar_objeto(nome):
    obj = bpy.data.objects.get(nome)
    if obj is None:
        raise SystemExit(f"\nERRO: não encontrei o objeto '{nome}'. Confira o nome no Outliner (canto superior direito).\n")
    return obj


def fov_da_camera(dados, largura, altura):
    """Campo de visão vertical (graus) de uma câmera do Blender, para a resolução dada."""
    ajuste = dados.sensor_fit
    if ajuste == "AUTO":
        ajuste = "HORIZONTAL" if largura >= altura else "VERTICAL"
        tamanho = dados.sensor_width
    else:
        tamanho = dados.sensor_width if ajuste == "HORIZONTAL" else dados.sensor_height
    if ajuste == "HORIZONTAL":
        h = 2 * math.atan(tamanho / 2 / dados.lens)
        return math.degrees(2 * math.atan(math.tan(h / 2) * altura / largura))
    return math.degrees(2 * math.atan(tamanho / 2 / dados.lens))


def centro_de(objs):
    return sum((centro(o) for o in objs), Vector()) / len(objs)
