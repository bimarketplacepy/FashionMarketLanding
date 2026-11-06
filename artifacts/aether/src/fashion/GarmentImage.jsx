// Imagen de prenda del catálogo.
//
// Si la prenda tiene `imageSet` (variantes generadas por
// scripts/optimize-garment-images.mjs en public/garments) se sirve un <picture>
// con AVIF y WebP en varios anchos, ancho y alto explícitos (sin saltos de
// layout), carga diferida y decodificación asíncrona. Sin imageSet cae al PNG
// original (`thumbnail` / `image`), que sólo existe en el workspace.
export function garmentSrcSet(set, format) {
  return set.widths.map((width) => `${set.src}.${set.hash}-${width}.${format} ${width}w`).join(", ");
}

export function garmentFallbackSrc(item, width = 800) {
  const set = item?.imageSet;
  if (!set) return item?.thumbnail || item?.image || "";
  const best = set.widths.find((candidate) => candidate >= width) || set.widths[set.widths.length - 1];
  return `${set.src}.${set.hash}-${best}.webp`;
}

export function GarmentImage({
  item,
  alt,
  sizes = "(max-width: 640px) 50vw, 25vw",
  priority = false,
  className = "garment-picture",
  imgClassName,
  ...props
}) {
  const set = item?.imageSet;
  const label = alt ?? item?.name ?? "";
  const loading = priority ? "eager" : "lazy";
  const fetchPriority = priority ? "high" : undefined;

  if (!set) {
    return (
      <img
        className={imgClassName}
        src={item?.thumbnail || item?.image}
        alt={label}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        {...props}
      />
    );
  }

  return (
    <picture className={className}>
      {set.formats.includes("avif") && <source type="image/avif" srcSet={garmentSrcSet(set, "avif")} sizes={sizes} />}
      <img
        className={imgClassName}
        src={garmentFallbackSrc(item)}
        srcSet={garmentSrcSet(set, "webp")}
        sizes={sizes}
        width={set.width}
        height={set.height}
        alt={label}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        {...props}
      />
    </picture>
  );
}
