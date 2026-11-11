"""
Planeja o passeio em cenas (o modo padrão do site): a ordem das vistas, como cada
foto se encaixa dentro da anterior e as máscaras das passagens (porta e arcos).

Pré-requisitos: tools/make_depth.py (só o _disp.npy é usado aqui) e build_assets.py.
Uso:  python tools/cine_plan.py
Saída: assets/scenes/cine.json, assets/scenes/sNN.gate.webp (abertura da passagem)
       e tools/_work/cine_sNN.jpg (diagnóstico: A com a moldura de B | B | A e B misturadas).

Cada foto vizinha é quase um recorte ampliado da anterior. O encaixe de B em A é uma
semelhança sem rotação (escala + deslocamento), achada por pontos em comum: a câmera
amplia A até coincidir com o quadro de B e a troca acontece nesse instante.
Coordenadas: x de 0 a 1672/941 (largura/altura), y de 0 a 1 (de cima para baixo).
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
W = ROOT / "tools" / "_work"
OUT = ROOT / "assets" / "scenes"
IMG_W, IMG_H = 1672, 941
ASPECT = IMG_W / IMG_H

# Ordem do passeio. As intermediárias quase idênticas à vizinha (s03b, s05b, s06b, s08b:
# escala 0,95–1,0) ficam de fora: seriam trocas de foto sem movimento que as disfarce.
SEQUENCE = ["s01", "s02", "s02b", "s03", "s04", "s05", "s06", "s06c", "s07",
            "s08", "s08c", "s09", "s09b", "s10"]

# Passagens: a abertura da foto A (porta, arco), por onde B aparece antes da troca.
# Polígono aproximado em % da imagem; a profundidade recorta o que está perto (batentes,
# a folha da porta, plantas).
GATES = {
    "s02b": {"ellipse": (41.5, 43, 24, 40)},
    "s04": {"poly": [(61, 80), (61, 20), (64, 9), (70, 3.5), (76, 3.5), (82, 9), (84.5, 20), (84.5, 80)]},
    "s06c": {"poly": [(35.5, 100), (35.5, 20), (40, 8), (50, 3), (80, 3), (90, 8), (93, 20), (93, 100)]},
    "s08c": {"poly": [(40.5, 100), (40.5, 15), (45, 6), (55, 2), (75, 2), (83, 8), (86, 18), (86, 100)]},
}

yy, xx = np.mgrid[0:IMG_H, 0:IMG_W].astype(np.float32)


def gate_mask(name, spec):
    region = np.zeros((IMG_H, IMG_W), np.uint8)
    if "ellipse" in spec:
        cx, cy, rx, ry = spec["ellipse"]
        cv2.ellipse(region, (round(cx * IMG_W / 100), round(cy * IMG_H / 100)),
                    (round(rx * IMG_W / 100), round(ry * IMG_H / 100)), 0, 0, 360, 1, -1)
    else:
        pts = np.int32([(x * IMG_W / 100, y * IMG_H / 100) for x, y in spec["poly"]])
        cv2.fillPoly(region, [pts], 1)
    region = region.astype(bool)
    disp = cv2.GaussianBlur(np.load(W / f"{name}_disp.npy").astype(np.float32), (0, 0), 2)
    ring = cv2.dilate(region.astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool) & ~region
    far = np.percentile(disp[region], 25)
    near = np.median(disp[ring])
    m = region & (disp < far + 0.55 * (near - far))
    # a maior mancha, sem furos
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    if n > 1:
        m = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    filled = m.copy()
    cv2.floodFill(filled, None, (0, 0), 1)
    m = m | (1 - filled)
    m = cv2.erode(m, np.ones((5, 5), np.uint8))
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.5), 0, 1)


_sift = cv2.SIFT_create(nfeatures=10000, contrastThreshold=0.015)


def features(name):
    return _sift.detectAndCompute(cv2.imread(str(W / f"{name}.png"), cv2.IMREAD_GRAYSCALE), None)


def similarity(a, b, fa, fb, mask=None):
    """B -> A: p_A = s * p_B + t (coordenadas em alturas de imagem). RANSAC com 2 pontos."""
    (ka, da), (kb, db) = fa, fb
    m = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=80)).knnMatch(db, da, k=2)
    good = [x for x, y in m if x.distance < 0.8 * y.distance]
    pb = np.float64([kb[x.queryIdx].pt for x in good]) / IMG_H
    pa = np.float64([ka[x.trainIdx].pt for x in good]) / IMG_H
    if mask is not None:
        # nas passagens, vale o que se vê pela abertura (o fundo, que continua em B)
        grow = cv2.dilate((mask > 0.5).astype(np.uint8), np.ones((41, 41), np.uint8))
        keep = grow[np.clip((pa[:, 1] * IMG_H).astype(int), 0, IMG_H - 1),
                    np.clip((pa[:, 0] * IMG_H).astype(int), 0, IMG_W - 1)] > 0
        if keep.sum() >= 12:
            pa, pb = pa[keep], pb[keep]
    rng = np.random.default_rng(0)
    best = None
    for _ in range(5000):
        i, j = rng.choice(len(pa), 2, replace=False)
        d = np.linalg.norm(pb[i] - pb[j])
        if d < 0.05:
            continue
        s = np.linalg.norm(pa[i] - pa[j]) / d
        t = pa[i] - s * pb[i]
        inl = np.linalg.norm(pa - (s * pb + t), axis=1) < 0.012
        if best is None or inl.sum() > best.sum():
            best = inl
    P, Q = pb[best], pa[best]
    M = np.c_[np.r_[P[:, 0], P[:, 1]], np.r_[np.ones(len(P)), np.zeros(len(P))], np.r_[np.zeros(len(P)), np.ones(len(P))]]
    s, tx, ty = np.linalg.lstsq(M, np.r_[Q[:, 0], Q[:, 1]], rcond=None)[0]
    res = np.median(np.linalg.norm(Q - (s * P + [tx, ty]), axis=1))
    return float(s), float(tx), float(ty), int(best.sum()), len(good), float(res)


def diagnose(a, b, T, gate):
    s, tx, ty = T
    A = cv2.imread(str(W / f"{a}.png"))
    B = cv2.imread(str(W / f"{b}.png"))
    # B dentro de A, na posição do encaixe
    M = np.float32([[s, 0, tx * IMG_H], [0, s, ty * IMG_H]])
    Bw = cv2.warpAffine(B, M, (IMG_W, IMG_H), borderValue=(0, 0, 0))
    inside = cv2.warpAffine(np.ones((IMG_H, IMG_W), np.float32), M, (IMG_W, IMG_H))
    mix = (A * 0.5 + Bw * 0.5 * inside[..., None] + A * 0.5 * (1 - inside[..., None])).astype(np.uint8)
    frame = A.copy()
    cv2.rectangle(frame, (int(tx * IMG_H), int(ty * IMG_H)), (int((tx + s * ASPECT) * IMG_H), int((ty + s) * IMG_H)), (0, 255, 255), 4)
    if gate is not None:
        cnt, _ = cv2.findContours((gate > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(frame, cnt, -1, (255, 0, 255), 4)
    row = np.hstack([frame, B, mix])
    cv2.imwrite(str(W / f"cine_{b}.jpg"), cv2.resize(row, None, fx=0.3, fy=0.3), [cv2.IMWRITE_JPEG_QUALITY, 80])


def main():
    from PIL import Image
    feats = {n: features(n) for n in SEQUENCE}
    gates = {}
    for name, spec in GATES.items():
        g = gate_mask(name, spec)
        gates[name] = g
        half = cv2.resize(g, (IMG_W // 2, IMG_H // 2), interpolation=cv2.INTER_AREA)
        Image.fromarray((half * 255).round().astype(np.uint8)).save(OUT / f"{name}.gate.webp", "WEBP", lossless=True)
    pairs = []
    for a, b in zip(SEQUENCE, SEQUENCE[1:]):
        s, tx, ty, inl, n, res = similarity(a, b, feats[a], feats[b], gates.get(a))
        # duração da troca (meia largura, em ampliação): curta quando pouco da imagem coincide
        # (objetos perto da câmera mudam de lugar entre as fotos e apareceriam em dobro)
        share = inl / max(n, 1)
        fade = 0.03 if a in gates else (0.035 if share >= 0.5 else 0.02)
        pairs.append({"a": a, "b": b, "s": round(s, 5), "t": [round(tx, 5), round(ty, 5)],
                      "gate": a in gates, "fade": fade})
        print(f"{a:>5} -> {b:<5} escala {s:.3f}  B em A: x {tx / ASPECT:.2f}..{(tx + s * ASPECT) / ASPECT:.2f}"
              f" y {ty:.2f}..{ty + s:.2f}  ({inl}/{n} pontos, resíduo {res * 100:.2f}%)"
              + ("  [passagem]" if a in gates else "") + f"  troca ±{fade * 100:.1f}%")
        diagnose(a, b, (s, tx, ty), gates.get(a))
    (OUT / "cine.json").write_text(json.dumps({"aspect": ASPECT, "sequence": SEQUENCE, "pairs": pairs}, indent=1))
    print("cine.json ok")


if __name__ == "__main__":
    main()
