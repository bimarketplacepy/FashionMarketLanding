# Deja cada recorte del catálogo como cutout sobre fondo transparente (fondo liso
# en la UI), sin persona ni fondo fotográfico. Sin APIs: usa rembg local.
#
#   python3 scripts/clean-garment-images.py            # procesa todo data/imported/
#   python3 scripts/clean-garment-images.py <id>...    # solo esos items
#
# Estrategia:
#   - Si el item vino del flujo Claude (data/claude-inbox/pending.json guarda la
#     foto origen y el análisis su bounding box), se corre u2net_cloth_seg sobre
#     la FOTO COMPLETA (el modelo rinde mucho mejor con la persona entera), se
#     elige el panel según categoría (superior/inferior/cuerpo entero) y recién
#     después se recorta el bounding box del item.
#   - Calzado y accesorios usan u2net (objeto completo) sobre el recorte.
#   - Fallbacks en cadena; si todo queda casi vacío se conserva el original.
# Los originales se respaldan una única vez en data/imported-originals/.
import io
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
IMPORTED = ROOT / "data" / "imported"
BACKUP = ROOT / "data" / "imported-originals"
LIBRARY = ROOT / "data" / "library.json"
PENDING = ROOT / "data" / "claude-inbox" / "pending.json"
ANALYSIS = ROOT / "data" / "claude-inbox" / "analysis"

CANVAS = 1024
OCCUPANCY = 0.86
MIN_COVERAGE = 0.02

cloth_session = new_session("u2net_cloth_seg")
object_session = new_session("u2net")
photo_cache = {}


def load_sources():
    """id de librería -> (ruta foto completa, boundingBox 0-1000)."""
    try:
        pending = json.loads(PENDING.read_text())["entries"]
    except FileNotFoundError:
        return {}
    sources = {}
    for key, entry in pending.items():
        ids = entry.get("libraryIds") or []
        try:
            items = json.loads((ANALYSIS / f"{key}.json").read_text())["items"]
        except FileNotFoundError:
            continue
        for library_id, item in zip(ids, items):
            sources[library_id] = (ROOT / entry["image"], item.get("boundingBox") or {})
    return sources


def cloth_panels_for_photo(photo_path):
    if photo_path not in photo_cache:
        result = Image.open(io.BytesIO(remove(photo_path.read_bytes(), session=cloth_session))).convert("RGBA")
        height = result.height // 3
        photo_cache[photo_path] = [
            result.crop((0, index * height, result.width, (index + 1) * height))
            for index in range(3)
        ]
    return photo_cache[photo_path]


def crop_bbox(image, box):
    """Mismo recorte que cropDetectedItem: bbox 0-1000 + padding 8%."""
    x = (box.get("x", 0) / 1000) * image.width
    y = (box.get("y", 0) / 1000) * image.height
    w = (box.get("width", 1000) / 1000) * image.width
    h = (box.get("height", 1000) / 1000) * image.height
    pad = max(12, round(max(w, h) * 0.08))
    left = max(0, int(x - pad))
    top = max(0, int(y - pad))
    right = min(image.width, int(x + w + pad))
    bottom = min(image.height, int(y + h + pad))
    return image.crop((left, top, right, bottom))


def coverage(image):
    alpha = np.asarray(image)[:, :, 3]
    return (alpha > 24).mean()


def harden_alpha(image, threshold=28):
    rgba = np.asarray(image).copy()
    rgba[:, :, 3][rgba[:, :, 3] < threshold] = 0
    return Image.fromarray(rgba)


def score(image):
    """Cobertura x solidez: penaliza máscaras casi vacías o llenas de agujeros."""
    mask = np.asarray(image)[:, :, 3] > 24
    visible = mask.mean()
    if visible < MIN_COVERAGE:
        return 0.0
    filled = ndimage.binary_fill_holes(mask)
    solidity = mask.sum() / max(1, filled.sum())
    return (solidity ** 2) * min(visible, 0.5)


def keep_main_blobs(image, keep_ratio=0.06):
    rgba = np.asarray(image).copy()
    mask = rgba[:, :, 3] > 24
    labels, count = ndimage.label(mask)
    if count <= 1:
        return image
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    largest = sizes.max()
    drop = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s < largest * keep_ratio])
    rgba[drop] = 0
    return Image.fromarray(rgba)


def frame(image):
    alpha = np.asarray(image)[:, :, 3]
    rows = np.any(alpha > 24, axis=1)
    cols = np.any(alpha > 24, axis=0)
    if not rows.any():
        return None
    top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
    trimmed = image.crop((left, top, right, bottom))
    target = int(CANVAS * OCCUPANCY)
    scale = min(target / trimmed.width, target / trimmed.height)
    resized = trimmed.resize((max(1, round(trimmed.width * scale)), max(1, round(trimmed.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return canvas


PANEL_ORDER = {"upperbody": [0, 2], "lowerbody": [1, 2], "wholebody_up": [2, 0]}


def candidates(item, source):
    """Devuelve (candidatos prenda-sola, candidatos de respaldo)."""
    part = item["part"]
    crop_bytes = (BACKUP / Path(item["image"]).name).read_bytes()
    generic = Image.open(io.BytesIO(remove(crop_bytes, session=object_session))).convert("RGBA")
    if part not in PANEL_ORDER:
        return [generic], []

    cloth = []
    if source is not None:
        photo_path, box = source
        if photo_path.exists():
            panels = cloth_panels_for_photo(photo_path)
            cloth += [crop_bbox(panels[index], box) for index in PANEL_ORDER[part]]
    cloth_crop = Image.open(io.BytesIO(remove(crop_bytes, session=cloth_session))).convert("RGBA")
    height = cloth_crop.height // 3
    crop_panels = [cloth_crop.crop((0, i * height, cloth_crop.width, (i + 1) * height)) for i in range(3)]
    cloth += [crop_panels[index] for index in PANEL_ORDER[part]]
    return cloth, [generic]


def process(item, sources):
    filename = Path(item["image"]).name
    source_path = IMPORTED / filename
    if not source_path.exists():
        return "missing"
    backup_path = BACKUP / filename
    if not backup_path.exists():
        shutil.copyfile(source_path, backup_path)
    preferred, fallback = candidates(item, sources.get(item["id"]))
    best = None
    best_score = 0.0
    for candidate in preferred:
        candidate = harden_alpha(candidate)
        candidate_score = score(candidate)
        if candidate_score > best_score:
            best = candidate
            best_score = candidate_score
    if best_score < 0.03:
        for candidate in fallback:
            candidate = harden_alpha(candidate)
            candidate_score = score(candidate)
            if candidate_score > best_score:
                best = candidate
                best_score = candidate_score
    if best is None:
        return "kept-original"
    framed = frame(keep_main_blobs(best))
    if framed is None:
        return "kept-original"
    framed.save(source_path, "PNG")
    return "ok"


def main():
    only = set(sys.argv[1:])
    BACKUP.mkdir(parents=True, exist_ok=True)
    sources = load_sources()
    library = json.loads(LIBRARY.read_text())
    results = {}
    for index, item in enumerate(library, 1):
        if only and item["id"] not in only:
            continue
        status = process(item, sources)
        results[status] = results.get(status, 0) + 1
        print(f"[{index}/{len(library)}] {status:14} {item['part']:14} {item['name'][:50]}", flush=True)
    print("\nResumen:", json.dumps(results))


if __name__ == "__main__":
    main()
