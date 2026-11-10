# Recorta el fondo de estudio de las fotos de looks (data/look-models/<id>.png)
# y deja <id>-recorte.png con transparencia, para la fila con profundidad de la
# landing. Sin APIs: rembg local. Ver scripts/generate-look-models.mjs.
#
#   python3 scripts/cutout-look-models.py            # los que no tienen recorte
#   python3 scripts/cutout-look-models.py <id>...    # rehace esos
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "look-models"
MODEL = os.environ.get("LOOK_CUTOUT_MODEL", "isnet-general-use")


def keep_largest(alpha):
    # La persona es el componente más grande; se descartan manchas sueltas del
    # fondo, pero se conservan piezas grandes separadas (ej. un sombrero).
    mask = alpha > 24
    labels, count = ndimage.label(mask)
    if count <= 1:
        return alpha
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    biggest = sizes.max()
    keep = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s >= biggest * 0.02])
    return np.where(keep, alpha, 0).astype(np.uint8)


def main():
    ids = sys.argv[1:]
    session = new_session(MODEL)
    sources = sorted(p for p in WORK.glob("*.png") if not p.stem.endswith("-recorte"))
    done = 0
    for src in sources:
        target = WORK / f"{src.stem}-recorte.png"
        if ids and src.stem not in ids:
            continue
        if not ids and target.exists():
            continue
        image = Image.open(src).convert("RGB")
        cut = remove(image, session=session, post_process_mask=True)
        rgba = np.array(cut)
        rgba[:, :, 3] = keep_largest(rgba[:, :, 3])
        coverage = (rgba[:, :, 3] > 24).mean()
        if coverage < 0.05:
            print(f"✗ {src.stem}: recorte casi vacío ({coverage:.1%}), se omite")
            continue
        Image.fromarray(rgba).save(target, optimize=True)
        done += 1
        print(f"✓ {src.stem} ({coverage:.0%} de la imagen)")
    print(f"Recortes nuevos: {done}")


if __name__ == "__main__":
    main()
