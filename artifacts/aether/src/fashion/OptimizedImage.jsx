import { forwardRef } from "react";
import { Image } from "@unpic/react";
import { engineUrl } from "../embed/base.js";

// Bajo /api para que en el deployment el router lo mande al api-server, que es
// quien monta ipx en producción (ahí no corre ningún servidor de Vite).
// Se arma al pintar: embebida en Odoo el prefijo del motor se define al montar.
const ipxOptions = () => ({ ipx: { baseURL: engineUrl("/api/_ipx") } });
const DEFAULT_BREAKPOINTS = [160, 240, 320, 480, 640, 800, 960, 1280];

function sourcePath(src) {
  if (!src || typeof src !== "string") return src;
  return src.split(/[?#]/, 1)[0];
}

export const OptimizedImage = forwardRef(function OptimizedImage({
  src,
  alt = "",
  sizes = "100vw",
  breakpoints = DEFAULT_BREAKPOINTS,
  quality = 80,
  priority = false,
  loading,
  decoding,
  ...props
}, ref) {
  const normalizedSource = sourcePath(src);

  if (!normalizedSource || normalizedSource.startsWith("data:") || normalizedSource.startsWith("blob:") || normalizedSource.startsWith("/api/")) {
    return <img ref={ref} src={engineUrl(src)} alt={alt} sizes={sizes} loading={loading || (priority ? "eager" : "lazy")} decoding={decoding || "async"} {...props} />;
  }

  return (
    <Image
      ref={ref}
      src={normalizedSource}
      alt={alt}
      fallback="ipx"
      options={ipxOptions()}
      operations={{ ipx: { quality } }}
      layout="fullWidth"
      unstyled
      sizes={sizes}
      breakpoints={breakpoints}
      priority={priority}
      loading={loading}
      decoding={decoding}
      {...props}
    />
  );
});
