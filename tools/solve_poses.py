"""
Descobre de onde cada imagem do passeio foi "fotografada": a posição e a direção de
cada câmera num espaço único, e a escala de profundidade de cada relevo.

Pré-requisito: tools/make_depth.py (gera _disp.npy e _metric.npy em tools/_work/).
Uso:  python tools/solve_poses.py [--fov-search]
Saída: tools/_work/poses.json (lido por build_assets.py) e imagens de diagnóstico
       tools/_work/pose_sNN.jpg  (vista B | vista A reprojetada em B | mistura).

Convenções: câmera OpenCV (x direita, y para baixo, z para frente) nos cálculos;
na saída, a convenção do site (three.js: x direita, y para cima, câmera olhando -Z).
O mundo é o referencial da primeira vista, nivelado pelo piso (y = para cima).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

W = Path(__file__).resolve().parent / "_work"
IMG_W, IMG_H = 1672, 941
FOV = 52.0  # campo de visão vertical comum às imagens (graus); --fov-search estima

# Como cada vista se liga a uma vista já resolvida (a da esquerda já precisa ter aparecido).
# Na ordem do passeio, sempre que possível: cada par que se funde na tela fica alinhado
# diretamente entre si.
#   auto  pontos em comum achados automaticamente (mesmo cômodo, ou vendo pela passagem)
#   pts   pares de pontos marcados à mão, em % da imagem: (xA, yA, xB, yB)
#   walk  atravessar uma porta: anda na direção de `toward` (uv em A), mantendo a altura,
#         até passar `past` metros do ponto `door` (uv na soleira) e vira `yaw` graus (+ = direita)
# A ordem do passeio (e o momento de cada vista) está em SHOTS, em js/journey.js.
PAIRS = [
    ("s01", "s02", {"mode": "auto"}),
    ("s02", "s02b", {"mode": "auto"}),
    ("s02b", "s03", {"mode": "auto"}),
    ("s03", "s03b", {"mode": "auto"}),
    ("s03b", "s04", {"mode": "auto"}),
    ("s04", "s05", {"mode": "walk", "toward": (0.73, 0.45), "door": (0.72, 0.77), "past": 0.5, "yaw": 0}),
    ("s05", "s05b", {"mode": "auto"}),
    ("s05b", "s06", {"mode": "auto"}),
    ("s06", "s06b", {"mode": "auto"}),
    ("s06b", "s06c", {"mode": "auto"}),
    ("s06c", "s07", {"mode": "auto"}),
    ("s07", "s08", {"mode": "auto"}),
    ("s08", "s08b", {"mode": "auto"}),
    ("s08b", "s08c", {"mode": "auto"}),
    ("s08c", "s09", {"mode": "auto"}),
    ("s09", "s10", {"mode": "auto"}),
    ("s10", "s09b", {"mode": "auto"}),   # s09→s09b tem poucos pontos em comum; via s10 é firme
]


# ---------------------------------------------------------------- utilidades
def intrinsics(fov):
    fy = (IMG_H / 2) / np.tan(np.radians(fov) / 2)
    return np.array([[fy, 0, IMG_W / 2], [0, fy, IMG_H / 2], [0, 0, 1]], np.float64)


class View:
    def __init__(self, name):
        self.name = name
        self.rgb = cv2.imread(str(W / f"{name}.png"))
        self.disp = np.load(W / f"{name}_disp.npy").astype(np.float32)
        metric = np.load(W / f"{name}_metric.npy").astype(np.float32)
        self.a, self.b = fit_inverse(self.disp, metric)
        self.scale = 1.0

    def depth(self, x=None, y=None):
        d = self.disp if x is None else sample(self.disp, x, y)
        return self.scale / (self.a * d + self.b)

    def points(self, K, x, y):
        z = self.depth(x, y)
        return np.stack([(x - K[0, 2]) / K[0, 0] * z, (y - K[1, 2]) / K[1, 1] * z, z], -1)


def sample(img, x, y):
    n = len(x)
    pad = -n % 1024                      # remap aceita no máximo 32767 linhas
    mx = np.pad(x.astype(np.float32), (0, pad)).reshape(-1, 1024)
    my = np.pad(y.astype(np.float32), (0, pad)).reshape(-1, 1024)
    return cv2.remap(img, mx, my, cv2.INTER_LINEAR).reshape(-1)[:n]


def fit_inverse(disp, metric):
    """Ajusta 1/z_metro = a*disp + b (robusto): o relevo nítido ganha a escala em metros."""
    m = (disp > 0.03) & (metric > 0.2) & (metric < 25)
    d, iz = disp[m][::7], 1 / metric[m][::7]
    w = np.ones_like(d)
    for _ in range(8):
        A = np.stack([d * w, w], 1)
        a, b = np.linalg.lstsq(A, iz * w, rcond=None)[0]
        r = np.abs(a * d + b - iz)
        w = 1 / np.maximum(r / (np.median(r) + 1e-6), 1)
    b = max(b, 1 / 120)  # fundo nunca infinitamente longe
    return float(a), float(b)


def floor_plane(view, K):
    """Plano do piso (RANSAC) na faixa de baixo da imagem: normal "para cima" e altura."""
    ys, xs = np.mgrid[int(IMG_H * 0.62):IMG_H:6, 0:IMG_W:6]
    P = view.points(K, xs.ravel().astype(np.float64), ys.ravel().astype(np.float64))
    rng = np.random.default_rng(1)
    P = P[rng.permutation(len(P))[:4000]]
    best, best_n = None, -1
    for _ in range(1500):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        if n[1] > 0:
            n = -n                       # "para cima" = -y na câmera OpenCV
        if n[1] > -0.7:
            continue                     # piso não pode estar muito inclinado
        d = -n @ s[0]
        inl = np.abs(P @ n + d) < 0.02 * np.linalg.norm(P, axis=1)
        if inl.sum() > best_n:
            best_n, best = inl.sum(), inl
    Q = P[best]
    c = Q.mean(0)
    n = np.linalg.svd(Q - c)[2][-1]
    if n[1] > 0:
        n = -n
    return n, abs(float(n @ c)), best_n / len(P)


_MATCHES = {}


def match_auto(A, B):
    key = (A.name, B.name)
    if key not in _MATCHES:
        _MATCHES[key] = _match_auto(A, B)
    return _MATCHES[key]


def _match_auto(A, B):
    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=0.02)
    ka, da = sift.detectAndCompute(cv2.cvtColor(A.rgb, cv2.COLOR_BGR2GRAY), None)
    kb, db = sift.detectAndCompute(cv2.cvtColor(B.rgb, cv2.COLOR_BGR2GRAY), None)
    m = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=100)).knnMatch(da, db, k=2)
    good = [p for p, q in m if p.distance < 0.78 * q.distance]
    pa = np.float64([ka[g.queryIdx].pt for g in good])
    pb = np.float64([kb[g.trainIdx].pt for g in good])
    _, mask = cv2.findFundamentalMat(pa, pb, cv2.USAC_MAGSAC, 1.5, 0.999, 10000)
    keep = mask.ravel().astype(bool)
    pa, pb = pa[keep], pb[keep]
    # descarta pontos sobre bordas de profundidade (relevo pouco confiável ali)
    gy, gx = np.gradient(cv2.GaussianBlur(A.disp, (0, 0), 2))
    edge = sample(np.hypot(gx, gy), pa[:, 0], pa[:, 1])
    ok = edge < 0.004
    return pa[ok], pb[ok]


def solve_pnp(A, B, K, pa, pb, thresh=None):
    obj = A.points(K, pa[:, 0], pa[:, 1])
    if thresh is None:
        # poucos pontos marcados à mão: usa todos
        ok, rvec, tvec = cv2.solvePnP(obj, pb, K, None, flags=cv2.SOLVEPNP_SQPNP)
        inl = np.arange(len(pa))
    else:
        ok, rvec, tvec, inl = cv2.solvePnPRansac(obj, pb, K, None, iterationsCount=20000,
                                                 reprojectionError=thresh, confidence=0.9999,
                                                 flags=cv2.SOLVEPNP_EPNP)
        inl = None if inl is None else inl.ravel()
    if not ok or inl is None or len(inl) < 4:
        raise RuntimeError(f"{A.name}->{B.name}: PnP falhou")
    rvec, tvec = cv2.solvePnPRefineLM(obj[inl], pb[inl], K, None, rvec, tvec)
    R = cv2.Rodrigues(rvec)[0]
    proj = (K @ (obj[inl] @ R.T + tvec.ravel()).T).T
    err = np.linalg.norm(proj[:, :2] / proj[:, 2:] - pb[inl], axis=1)
    # escala do relevo B: profundidade "verdadeira" (vinda de A) / profundidade própria de B
    zt = (obj[inl] @ R.T + tvec.ravel())[:, 2]
    zb = B.depth(pb[inl, 0], pb[inl, 1])
    s = float(np.median(zt / zb))
    return R, tvec.ravel(), inl, float(np.median(err)), s


def level_rotation(n_up):
    """Rotação (câmera OpenCV -> mundo nivelado, y do mundo = para cima)."""
    # base do mundo (OpenCV): y = para baixo (contra a normal do piso), z = frente horizontal
    y = -n_up / np.linalg.norm(n_up)
    f = np.array([0, 0, 1.0])
    fz = f - (f @ y) * y
    fz /= np.linalg.norm(fz)
    x = np.cross(y, fz)
    return np.stack([x, y, fz])  # linhas: eixos do mundo em coords da câmera


def walk_pose(A, B, K, cfg, nA, nB, hA, hB):
    """Pose de B (câmera B -> câmera A, OpenCV) atravessando uma passagem."""
    def at(uv):
        return A.points(K, np.array([uv[0] * IMG_W]), np.array([uv[1] * IMG_H]))[0]
    down = -nA                                   # vetor "para baixo" em A
    T = at(cfg["toward"])
    move = T - (T @ down) * down                 # anda no plano horizontal
    heading = move / np.linalg.norm(move)
    pos = heading * (at(cfg["door"]) @ heading + cfg["past"])
    yaw = np.radians(cfg.get("yaw", 0))
    heading = rot_axis(down, yaw) @ heading      # yaw positivo = direita (eixo "para baixo")
    # B nivelado: o piso de B vira o piso de A; a frente horizontal de B vira `heading`
    fB = np.array([0, 0, 1.0])
    dB = -nB
    hfB = fB - (fB @ dB) * dB
    hfB /= np.linalg.norm(hfB)
    SB = np.stack([hfB, dB, np.cross(hfB, dB)], 1)
    SA = np.stack([heading, down, np.cross(heading, down)], 1)
    R_AB = SA @ SB.T                             # vetores de B -> A
    B.scale = hA / hB                            # mesma altura de câmera acima do piso
    return R_AB, pos


def rot_axis(axis, ang):
    axis = axis / np.linalg.norm(axis)
    return cv2.Rodrigues(axis * ang)[0]


# ---------------------------------------------------------------- diagnóstico
def splat(A, B, K, R_AB, t_AB, step=2):
    """Desenha o relevo de A visto pela câmera B (z-buffer simples)."""
    ys, xs = np.mgrid[0:IMG_H:step, 0:IMG_W:step]
    xs, ys = xs.ravel().astype(np.float64), ys.ravel().astype(np.float64)
    P = A.points(K, xs, ys)                       # em A
    Q = (P - t_AB) @ R_AB                         # A -> B  (R_AB leva B->A)
    ok = Q[:, 2] > 0.05
    pr = (K @ Q[ok].T).T
    px, py = pr[:, 0] / pr[:, 2], pr[:, 1] / pr[:, 2]
    col = A.rgb[ys[ok].astype(int), xs[ok].astype(int)]
    z = Q[ok, 2]
    out = np.zeros_like(A.rgb)
    zbuf = np.full((IMG_H, IMG_W), np.inf)
    ix, iy = np.round(px).astype(int), np.round(py).astype(int)
    for dx in range(-step // 2, step // 2 + 1):
        for dy in range(-step // 2, step // 2 + 1):
            jx, jy = ix + dx, iy + dy
            m = (jx >= 0) & (jx < IMG_W) & (jy >= 0) & (jy < IMG_H)
            order = np.argsort(-z[m])             # longe primeiro, perto sobrescreve
            jx2, jy2, c2, z2 = jx[m][order], jy[m][order], col[m][order], z[m][order]
            closer = z2 < zbuf[jy2, jx2] + 1e-9
            out[jy2[closer], jx2[closer]] = c2[closer]
            zbuf[jy2[closer], jx2[closer]] = np.minimum(zbuf[jy2[closer], jx2[closer]], z2[closer])
    return out


def diagnose(A, B, K, R_AB, t_AB):
    warped = splat(A, B, K, R_AB, t_AB)
    mix = cv2.addWeighted(B.rgb, 0.5, warped, 0.5, 0)
    row = np.hstack([B.rgb, warped, mix])
    cv2.imwrite(str(W / f"pose_{B.name}.jpg"), cv2.resize(row, None, fx=0.4, fy=0.4), [cv2.IMWRITE_JPEG_QUALITY, 80])


# ---------------------------------------------------------------- principal
def solve(fov, verbose=True, diag=False):
    K = intrinsics(fov)
    names = sorted({a for a, _, _ in PAIRS} | {b for _, b, _ in PAIRS})
    views = {n: View(n) for n in names}
    floors = {n: floor_plane(views[n], K) for n in names}
    # mundo = câmera s01 nivelada (OpenCV); pose[n] = (R: câmera n -> mundo, c: centro no mundo)
    first = names[0]
    L = level_rotation(floors[first][0])
    pose = {first: (L, np.zeros(3))}
    report, total = [], []
    for a, b, cfg in PAIRS:
        A, B = views[a], views[b]
        nA, hA, _ = floors[a]
        nB, hB, fracB = floors[b]
        hA *= A.scale
        if cfg["mode"] == "walk":
            R_AB, t_AB = walk_pose(A, B, K, cfg, nA, nB, hA, hB)
            info = "caminhada"
        else:
            if cfg["mode"] == "auto":
                pa, pb = match_auto(A, B)
                th = 4.0
            else:
                pts = np.float64(cfg["pts"])
                pa = pts[:, :2] / 100 * [IMG_W, IMG_H]
                pb = pts[:, 2:] / 100 * [IMG_W, IMG_H]
                th = None
            R, t, inl, err, s = solve_pnp(A, B, K, pa, pb, th)
            if th is not None:
                total.append(err)
            # R, t: A -> B (x_B = R x_A + t). Guardamos B -> A:
            R_AB = R.T
            t_AB = -R.T @ t
            B.scale = s
            info = f"{len(inl)}/{len(pa)} pontos, erro {err:.1f}px, escala {s:.2f}"
        Rw, cw = pose[a]
        pose[b] = (Rw @ R_AB, cw + Rw @ t_AB)
        yaw = np.degrees(np.arctan2(R_AB[0, 2], R_AB[2, 2]))
        dist = np.linalg.norm(t_AB)
        report.append(f"{a}->{b}: {info}; anda {dist:.2f} m, gira {yaw:+.0f}°, "
                      f"altura {hA:.2f}/{hB * B.scale:.2f} m (piso {fracB:.0%})")
        if diag:
            diagnose(A, B, K, R_AB, t_AB)
    if verbose:
        print("\n".join(report))
    return views, pose, float(np.mean(total)) if total else 0.0


def to_three(R, c):
    """Pose OpenCV (câmera -> mundo) -> matriz 4x4 three.js (coluna-maior)."""
    D = np.diag([1.0, -1.0, -1.0])
    M = np.eye(4)
    M[:3, :3] = D @ R @ D
    M[:3, 3] = D @ c
    return [float(x) for x in M.T.ravel()]


def main():
    fov = FOV
    if "--fov-search" in sys.argv:
        res = []
        for f in range(40, 72, 3):
            _, _, e = solve(f, verbose=False)
            res.append((e, f))
            print(f"fov {f}: erro médio {e:.2f}px")
        fov = min(res)[1]
        print("melhor fov:", fov)
    views, pose, err = solve(fov, diag=True)
    out = {"fov": fov, "image": [IMG_W, IMG_H], "views": {}}
    for n, v in views.items():
        a, b = v.a / v.scale, v.b / v.scale        # 1/z = a*d + b já com a escala da vista
        zn, zf = 1 / (a + b), 1 / b
        R, c = pose[n]
        out["views"][n] = {"near": zn, "far": zf, "matrix": to_three(R, c)}
    (W / "poses.json").write_text(json.dumps(out, indent=1))
    print(f"poses.json ok (erro médio {err:.1f}px)")


if __name__ == "__main__":
    main()
