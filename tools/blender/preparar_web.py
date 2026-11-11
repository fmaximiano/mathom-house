"""
Prepara o render do Blender para o site: converte os quadros PNG em WebP (duas resoluções)
e copia o camera.json. Roda fora do Blender (Python comum com Pillow).

Uso:
    pip install pillow
    python tools/blender/preparar_web.py pasta/do/render [--qualidade 80]

Saída: assets/passeio/ (vai para o site junto com o resto do repositório)
    quadros/0001.webp …       largura cheia do render
    quadros-960/0001.webp …   960 px de largura (celulares)
    luzes/0001.webp …         o canal das luzes, em 960 px
    ids/0001.png …            os objetos clicáveis, em 960 px (sem compressão com perdas)
    camera.json, passeio.json
Depois abra http://localhost:8000/passeio.html
"""
import argparse
import json
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "assets" / "passeio"


def converter(args):
    origem, pasta, nome, qualidade = args
    img = Image.open(origem / "quadros" / nome)
    base = nome.replace(".png", "")
    img.convert("RGB").save(pasta / "quadros" / f"{base}.webp", "WEBP", quality=qualidade, method=5)
    alt = round(img.height * 960 / img.width)
    img.convert("RGB").resize((960, alt), Image.LANCZOS).save(pasta / "quadros-960" / f"{base}.webp", "WEBP", quality=qualidade - 4, method=5)
    luz = origem / "luzes" / nome
    if luz.exists():
        Image.open(luz).convert("RGB").resize((960, alt), Image.LANCZOS).save(pasta / "luzes" / f"{base}.webp", "WEBP", quality=70, method=4)
    ids = origem / "ids" / nome
    if ids.exists():
        Image.open(ids).convert("L").resize((960, alt), Image.NEAREST).save(pasta / "ids" / f"{base}.png", optimize=True)
    return nome


def main():
    p = argparse.ArgumentParser()
    p.add_argument("render", type=Path)
    p.add_argument("--qualidade", type=int, default=80)
    op = p.parse_args()
    origem = op.render
    if not (origem / "camera.json").exists():
        sys.exit(f"não achei {origem / 'camera.json'} — aponte para a pasta que o render_passeio.py criou")
    nomes = sorted(f.name for f in (origem / "quadros").glob("*.png"))
    info = json.loads((origem / "camera.json").read_text(encoding="utf-8"))
    faltando = info["quadros"] - len(nomes)
    if faltando:
        print(f"AVISO: faltam {faltando} quadros de {info['quadros']} — o site mostra o mais próximo que existir.")
    for sub in ("quadros", "quadros-960", "luzes", "ids"):
        (DESTINO / sub).mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor() as ex:
        for i, _ in enumerate(ex.map(converter, [(origem, DESTINO, n, op.qualidade) for n in nomes]), 1):
            if i % 25 == 0 or i == len(nomes):
                print(f"{i}/{len(nomes)}", flush=True)
    shutil.copy(origem / "camera.json", DESTINO / "camera.json")
    (DESTINO / "passeio.json").write_text(json.dumps({
        "quadros": info["quadros"], "largura": info["largura"], "altura": info["altura"],
        "existentes": [int(n[:4]) for n in nomes],
        "luzes": (origem / "luzes").exists(), "ids": (origem / "ids").exists(),
    }))
    total = sum(f.stat().st_size for f in (DESTINO / "quadros").glob("*.webp")) / 1e6
    celular = sum(f.stat().st_size for f in (DESTINO / "quadros-960").glob("*.webp")) / 1e6
    print(f"\nPronto: {DESTINO}\n  computador: {total:.1f} MB   celular: {celular:.1f} MB")


if __name__ == "__main__":
    main()
