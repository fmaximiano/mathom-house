"""
Gera os arquivos finais usados pelo site (pasta assets/scenes/).

Pré-requisitos: tools/make_depth.py e tools/solve_poses.py já executados.
Uso:  python tools/build_assets.py [--no-upscale]

Para cada vista sNN gera:
  sNN.webp / sNN@2x.webp   cor (a @2x é ampliada com Real-ESRGAN)
  sNN.fx.webp              R = bordas de profundidade, G = luz morna, B = vegetação (meia resolução)
  sNN.depth.json           grade de disparidade Uint16 comprimida (zlib + base64)
e um manifest.json com o campo de visão, a pose e a escala de cada vista, e as luzes.
"""
import base64
import json
import sys
import zlib
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W = ROOT / "tools" / "_work"
OUT = ROOT / "assets" / "scenes"
IMG_W, IMG_H = 1672, 941
GRID_W, GRID_H = 419, 236  # vértices (≈4 px por célula)

yy, xx = np.mgrid[0:IMG_H, 0:IMG_W].astype(np.float32)


def feather(mask, px=1.5):
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), px)


# ---------------------------------------------------------------- máscaras de efeito
def light_mask(lights, fire):
    """Brilho em volta de cada fonte de luz."""
    m = np.zeros((IMG_H, IMG_W), np.float32)
    for x, y, r in lights + ([fire] if fire else []):
        d2 = ((xx - x) ** 2 + (yy - y) ** 2) / (r * r * 2.2)
        m = np.maximum(m, np.exp(-d2))
    return m


def vegetation_mask(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    m = (h > 55) & (h < 165) & (s > 0.22) & (v > 0.12)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 4) * 1.4, 0, 1)


def edge_mask(d):
    """Onde a profundidade salta (contornos de objetos): ali o relevo estica quando a
    câmera sai do ponto de vista da imagem, e a vista vizinha deve prevalecer."""
    gy, gx = np.gradient(cv2.GaussianBlur(d, (0, 0), 1.5))
    g = np.hypot(gx, gy)
    m = np.clip((g - 0.0025) / 0.006, 0, 1)
    m = cv2.dilate(m, np.ones((11, 11), np.uint8))
    return np.clip(cv2.GaussianBlur(m, (0, 0), 4) * 1.4, 0, 1)


# ---------------------------------------------------------------- profundidade
def process_depth(disp):
    # Engorda o primeiro plano: o "esticamento" da malha cai sobre o fundo, menos visível.
    d = np.maximum(disp, cv2.dilate(disp, np.ones((5, 5), np.uint8)) * 0.985)
    return cv2.GaussianBlur(d, (0, 0), 1.6)


def to_grid(d):
    g = cv2.resize(d, (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
    q = np.clip(g, 0, 1) * 65535
    return q.round().astype("<u2")


def save_depth(path, grid):
    """Delta por linha (valores pequenos comprimem muito melhor) + zlib, em base64
    dentro de um JSON (formato servido por qualquer hospedagem estática)."""
    g = grid.astype(np.int32)
    d = np.concatenate([g[:, :1], np.diff(g, axis=1)], axis=1)
    raw = zlib.compress((d & 0xFFFF).astype("<u2").tobytes(), 9)
    path.write_text(json.dumps({"w": int(grid.shape[1]), "h": int(grid.shape[0]),
                                "encoding": "zlib+delta-u16le+base64",
                                "data": base64.b64encode(raw).decode("ascii")}))


# ---------------------------------------------------------------- upscale
def upscale2x(rgb, cache=None):
    if cache is not None and cache.exists():
        return np.asarray(Image.open(cache).convert("RGB"))
    out = _upscale2x(rgb)
    if cache is not None:
        Image.fromarray(out).save(cache)
    return out


_MODEL = None


def _upscale2x(rgb):
    global _MODEL
    import torch
    from huggingface_hub import hf_hub_download
    from spandrel import ModelLoader
    if _MODEL is None:
        _MODEL = ModelLoader().load_from_file(hf_hub_download("ai-forever/Real-ESRGAN", "RealESRGAN_x2.pth")).model.eval()
    x = torch.from_numpy(np.ascontiguousarray(rgb)).permute(2, 0, 1).float().unsqueeze(0) / 255
    tile, pad = 384, 24
    _, _, h, w = x.shape
    out = torch.zeros(1, 3, h * 2, w * 2)
    with torch.no_grad():
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                ya, yb = max(0, y0 - pad), min(h, y0 + tile + pad)
                xa, xb = max(0, x0 - pad), min(w, x0 + tile + pad)
                y = _MODEL(x[:, :, ya:yb, xa:xb])
                ty, tx = (y0 - ya) * 2, (x0 - xa) * 2
                th, tw = min(tile, h - y0) * 2, min(tile, w - x0) * 2
                out[:, :, y0 * 2:y0 * 2 + th, x0 * 2:x0 * 2 + tw] = y[:, :, ty:ty + th, tx:tx + tw]
    return (out[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255).round().astype(np.uint8)


def save_webp(path, rgb, q):
    Image.fromarray(rgb).save(path, "WEBP", quality=q, method=6)


def main():
    from lights import LIGHTS, FIRE
    do_upscale = "--no-upscale" not in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    poses = json.loads((W / "poses.json").read_text())
    manifest = {"image": [IMG_W, IMG_H], "grid": [GRID_W, GRID_H], "fov": poses["fov"], "views": {}}
    for name, pose in poses["views"].items():
        lights, fire = LIGHTS.get(name, []), FIRE.get(name)
        rgb = np.asarray(Image.open(W / f"{name}.png").convert("RGB"))
        disp = np.load(W / f"{name}_disp.npy").astype(np.float32)
        d = process_depth(disp)
        save_depth(OUT / f"{name}.depth.json", to_grid(d))

        fx = np.stack([edge_mask(d), light_mask(lights, fire), vegetation_mask(rgb)], -1)
        # máscaras suaves: meia resolução basta (e pesa 4x menos)
        fx_half = cv2.resize(fx, (IMG_W // 2, IMG_H // 2), interpolation=cv2.INTER_AREA)
        Image.fromarray((fx_half * 255).round().astype(np.uint8)).save(OUT / f"{name}.fx.webp", "WEBP", lossless=True)

        save_webp(OUT / f"{name}.webp", rgb, 84)
        if do_upscale:
            save_webp(OUT / f"{name}@2x.webp", upscale2x(rgb, W / f"{name}@2x.png"), 78)

        zn, zf = pose["near"], pose["far"]
        z = 1 / (d * (1 / zn - 1 / zf) + 1 / zf)
        manifest["views"][name] = {
            "near": zn, "far": zf, "mid": float(np.median(z)),
            "matrix": pose["matrix"],
            "lights": [[x / IMG_W, y / IMG_H, r / IMG_W] for x, y, r in lights],
            "fire": [fire[0] / IMG_W, fire[1] / IMG_H, fire[2] / IMG_W] if fire else None,
        }
        Image.fromarray((fx * 255).round().astype(np.uint8)).save(W / f"{name}_fx_preview.png")
        print(name, "ok", flush=True)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print("manifest ok")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main()
