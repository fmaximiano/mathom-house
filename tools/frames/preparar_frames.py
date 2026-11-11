"""
Prepara os frames e a música do passeio em frames (frames.html).

Uso (na pasta mathom-house-2):
    pip install pillow            (e, de preferência, o cwebp e o ffmpeg instalados)
    python tools/frames/preparar_frames.py pasta/dos/frames [musica.mp3] [--fps 24]

- pasta/dos/frames: frame_0001.webp … frame_NNNN.webp (ou .png/.jpg), todos do mesmo tamanho;
- musica (opcional): qualquer formato que o ffmpeg leia.

Saída em assets/frames/:
    1920/frame_0001.webp …    paisagem, em três larguras (a página escolhe pela tela)
    1280/…, 960/…
    retrato/…                 a faixa central (3:4, altura cheia), para celulares em pé: eles só
                              baixam o que aparece na tela
    musica.m4a, musica.mp3    a música (AAC sem reconversão, e MP3 de reserva)
    frames.json               quantos frames, fps, tamanhos disponíveis

Compressão: com o cwebp, cada frame recebe a qualidade que precisa para ficar visualmente igual ao
original (PSNR 40 dB): folhagem cheia de detalhe fica maior, paredes lisas ficam pequenas. Sem ele,
o Pillow comprime com qualidade fixa.
Depois, rode tools/frames/rastrear.py para seguir os objetos clicáveis.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "assets" / "frames"
LARGURAS = (1920, 1280, 960)
RETRATO = 3 / 4                     # proporção da faixa central para telas em pé
CWEBP = shutil.which("cwebp")


def salvar(img, destino):
    if CWEBP:
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "f.png"
            img.save(png)
            subprocess.run([CWEBP, "-quiet", "-m", "6", "-psnr", "40", "-sharp_yuv", "-af", str(png), "-o", str(destino)],
                           check=True)
    else:
        img.save(destino, "WEBP", quality=74, method=6)


def converter(args):
    origem, i = args
    img = Image.open(origem).convert("RGB")
    nome = f"frame_{i:04d}.webp"
    for largura in LARGURAS:
        alt = round(img.height * largura / img.width)
        salvar(img if img.width <= largura else img.resize((largura, alt), Image.LANCZOS), DESTINO / str(largura) / nome)
    w = round(img.height * RETRATO)
    x = (img.width - w) // 2
    salvar(img.crop((x, 0, x + w, img.height)), DESTINO / "retrato" / nome)
    return img.size


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    fps = int(sys.argv[sys.argv.index("--fps") + 1]) if "--fps" in sys.argv else 24
    if "--fps" in sys.argv:
        args.remove(str(fps))
    if not args:
        raise SystemExit(__doc__)
    fonte = Path(args[0])
    frames = sorted(p for p in fonte.iterdir() if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg"))
    if not frames:
        raise SystemExit(f"Nenhum frame em {fonte}")
    if not CWEBP:
        print("cwebp não encontrado: usando o Pillow (arquivos um pouco maiores)")
    for pasta in [*map(str, LARGURAS), "retrato"]:
        shutil.rmtree(DESTINO / pasta, ignore_errors=True)
        (DESTINO / pasta).mkdir(parents=True)
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as ex:
        tamanhos = list(ex.map(converter, [(p, i + 1) for i, p in enumerate(frames)]))
    w, h = tamanhos[0]
    if len(args) > 1:
        musica = args[1]
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", musica, "-vn", "-c:a", "copy",
                        "-movflags", "+faststart", str(DESTINO / "musica.m4a")], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", musica, "-vn", "-c:a", "libmp3lame",
                        "-b:a", "160k", str(DESTINO / "musica.mp3")], check=True)
    rw = round(h * RETRATO)
    info = {
        "quadros": len(frames), "fps": fps, "largura": w, "altura": h,
        "tamanhos": [l for l in LARGURAS if l <= max(w, LARGURAS[-1])],
        "retrato": {"x": (w - rw) // 2, "largura": rw},
    }
    (DESTINO / "frames.json").write_text(json.dumps(info, indent=1))
    pesos = {p: sum(f.stat().st_size for f in (DESTINO / p).glob("*.webp")) / 1e6 for p in [*map(str, LARGURAS), "retrato"]}
    print(f"{len(frames)} frames {w}×{h} → assets/frames/ ({', '.join(f'{p}: {mb:.1f} MB' for p, mb in pesos.items())})")


if __name__ == "__main__":
    main()
