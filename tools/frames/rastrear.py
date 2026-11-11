"""
Segue pontos da imagem ao longo dos frames do passeio (para os textos e objetos clicáveis de
frames.html acompanharem a câmera).

Uso (na pasta mathom-house-2):
    pip install opencv-python-headless pillow
    python tools/frames/rastrear.py pasta/dos/frames

Lê tools/frames/ancoras.json (cada ponto: onde foi marcado e o trecho a seguir) e escreve
assets/frames/trilhas.json: para cada ponto, o primeiro frame e a posição (u, v) em cada frame do trecho.
O movimento de um frame para o seguinte vem do fluxo óptico (DIS, do OpenCV).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
ANCORAS = Path(__file__).with_name("ancoras.json")
SAIDA = RAIZ / "assets" / "frames" / "trilhas.json"
LARGURA = 960          # os frames são reduzidos a esta largura para o fluxo óptico
JANELA = 4             # raio (px) da vizinhança cujo movimento mediano move o ponto


def carregar(caminho):
    img = cv2.imread(str(caminho), cv2.IMREAD_GRAYSCALE)
    h, w = img.shape
    return cv2.resize(img, (LARGURA, round(h * LARGURA / w)), interpolation=cv2.INTER_AREA)


def mover(fluxo, u, v):
    h, w = fluxo.shape[:2]
    x, y = u * w, v * h
    x0, x1 = max(0, int(x) - JANELA), min(w, int(x) + JANELA + 1)
    y0, y1 = max(0, int(y) - JANELA), min(h, int(y) + JANELA + 1)
    if x0 >= x1 or y0 >= y1:
        return None
    d = np.median(fluxo[y0:y1, x0:x1].reshape(-1, 2), axis=0)
    nu, nv = float(x + d[0]) / w, float(y + d[1]) / h
    return (nu, nv) if -0.05 <= nu <= 1.05 and -0.05 <= nv <= 1.05 else None


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    frames = sorted(p for p in Path(sys.argv[1]).iterdir() if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg"))
    ancoras = json.loads(ANCORAS.read_text())["ancoras"]
    n = len(frames)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    # posição de cada âncora em cada frame (índices a partir de 0)
    pos = {a["id"]: {a["quadro"] - 1: (a["u"], a["v"])} for a in ancoras}
    cache = {}

    def img(i):
        if i not in cache:
            cache[i] = carregar(frames[i])
            for k in [k for k in cache if abs(k - i) > 2]:
                del cache[k]
        return cache[i]

    for sentido in (1, -1):
        # um fluxo por par de frames vizinhos, aplicado a todas as âncoras ativas naquele trecho
        faixa = range(0, n - 1) if sentido == 1 else range(n - 1, 0, -1)
        for i in faixa:
            j = i + sentido
            ativas = [a for a in ancoras if i in pos[a["id"]] and pos[a["id"]][i] is not None
                      and (a["de"] - 1 <= j <= a["ate"] - 1)
                      and ((sentido == 1 and i >= a["quadro"] - 1) or (sentido == -1 and i <= a["quadro"] - 1))]
            if not ativas:
                continue
            fluxo = dis.calc(img(i), img(j), None)
            for a in ativas:
                pos[a["id"]][j] = mover(fluxo, *pos[a["id"]][i])
        cache.clear()

    trilhas = {}
    for a in ancoras:
        p = pos[a["id"]]
        ks = sorted(k for k, v in p.items() if v is not None)
        de, ate = ks[0], ks[-1]
        pts = []
        for k in range(de, ate + 1):
            v = p.get(k)
            pts.append([round(v[0], 4), round(v[1], 4)] if v else None)
        trilhas[a["id"]] = {"de": de, "pts": pts}
    SAIDA.write_text(json.dumps(trilhas, separators=(",", ":")))
    print(f"{len(trilhas)} trilhas → {SAIDA.relative_to(RAIZ)} ({SAIDA.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
