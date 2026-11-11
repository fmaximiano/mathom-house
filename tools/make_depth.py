"""
Gera os mapas de profundidade das imagens da Mathom-house.

Uso:
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    pip install transformers pillow numpy opencv-python-headless scipy
    python tools/make_depth.py pasta/das/imagens

As imagens de entrada são as vistas do passeio: s01.*, s02.*, … e, entre elas, as
intermediárias s02b.*, s02c.* … (a ordem do passeio é definida em js/journey.js).

Dois modelos, cada um com o seu papel:
  _disp.npy    Depth Anything V2 (relativo): disparidade 0..1 com bordas nítidas — vira o relevo.
  _metric.npy  Depth Anything V2 Metric Indoor: profundidade em metros — dá a escala comum
               entre as vistas (altura da câmera, distâncias), usada por solve_poses.py.
Saída em tools/_work/. Depois: tools/solve_poses.py e tools/build_assets.py.
"""
import re
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODELS = {
    "disp": ("depth-anything/Depth-Anything-V2-Large-hf", {"height": 770, "width": 1372}),
    "metric": ("depth-anything/Depth-Anything-V2-Metric-Indoor-Large-hf", {"height": 518, "width": 924}),
}


def sources(src: Path):
    files = [p for p in src.iterdir() if re.fullmatch(r"s\d+[a-z]?\.(webp|png|jpe?g)", p.name, re.I)]
    return sorted(files, key=lambda p: p.stem.lower())


def predict(processor, model, img, size):
    inputs = processor(images=img, return_tensors="pt", size=size, keep_aspect_ratio=True, ensure_multiple_of=14)
    with torch.no_grad():
        pred = model(**inputs).predicted_depth
    return torch.nn.functional.interpolate(
        pred.unsqueeze(1), size=img.size[::-1], mode="bicubic", align_corners=False
    ).squeeze().numpy().astype(np.float32)


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out = Path(__file__).parent / "_work"
    out.mkdir(exist_ok=True)
    files = sources(src)
    if not files:
        raise SystemExit(f"nenhuma imagem sNN.* (ou sNNb.*) em {src}")
    force = "--force" in sys.argv

    for kind, (repo, size) in MODELS.items():
        todo = []
        for path in files:
            name = path.stem.lower()
            if force or not (out / f"{name}_{kind}.npy").exists():
                todo.append((name, path))
        if not todo:
            continue
        processor = AutoImageProcessor.from_pretrained(repo)
        model = AutoModelForDepthEstimation.from_pretrained(repo).eval()
        for name, path in todo:
            img = Image.open(path).convert("RGB")
            img.save(out / f"{name}.png")
            pred = predict(processor, model, img, size)
            if kind == "disp":
                # disparidade relativa -> 0..1 (resolução maior = bordas mais precisas)
                lo, hi = np.percentile(pred, 0.5), np.percentile(pred, 99.5)
                pred = np.clip((pred - lo) / (hi - lo), 0, 1)
                Image.fromarray((pred * 255).astype(np.uint8)).save(out / f"{name}_disp_preview.png")
            np.save(out / f"{name}_{kind}.npy", pred)
            print(f"{name} {kind}: {path.name} -> ok", flush=True)


if __name__ == "__main__":
    main()
