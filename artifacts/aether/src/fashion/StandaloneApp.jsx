import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowRight, Check, EnvelopeSimple, FacebookLogo, InstagramLogo, List, Plus, Sparkle, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { WardrobeImportFlow } from "./import-flow.jsx";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { VirtualTryOn } from "./virtual-tryon.jsx";
import { FashionIntro } from "./FashionIntro.jsx";
import { BrandLogo } from "./BrandLogo.jsx";
import { ProductSheet } from "./ProductSheet.jsx";
import { MATERIAL_LABELS, SEASON_LABELS, SILHOUETTE_LABELS } from "./format.js";
import { GARMENT_TYPES, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";
import "./styles.css";

const STORAGE_KEY = "open-wardrobe-edits-v1";
const DELETED_STORAGE_KEY = "open-wardrobe-deleted-v1";

const TYPES = [
  { id: "all", label: "Todo" },
  { id: "upperbody", label: "Prendas superiores", singular: "Prenda superior" },
  { id: "wholebody", label: "Vestidos y enterizos", singular: "Vestido o enterizo" },
  { id: "wholebody_up", label: "Abrigos", singular: "Abrigo" },
  { id: "lowerbody", label: "Prendas inferiores", singular: "Prenda inferior" },
  { id: "accessories_up", label: "Accesorios", singular: "Accesorio" },
  { id: "shoes", label: "Calzado", singular: "Calzado" },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));
const TYPE_ORDER = Object.fromEntries(TYPES.slice(1).map((type, index) => [type.id, index]));
const GENDER_OPTIONS = [["mujer", "Mujer"], ["hombre", "Hombre"], ["unisex", "Unisex"]];
const GARMENT_TYPE_LABELS = {
  top: "Top", blouse: "Blusa", shirt: "Camisa", tshirt: "Remera", sweater: "Suéter", dress: "Vestido", jumpsuit: "Enterizo",
  skirt: "Pollera", trousers: "Pantalón", jeans: "Jean", shorts: "Short", jacket: "Chaqueta", coat: "Abrigo", heels: "Tacones",
  shoes: "Calzado", bag: "Cartera / bolso", jewelry: "Joyería", belt: "Cinturón", scarf: "Pañuelo", hat: "Sombrero", other: "Otro",
};

const DEMO_THEMES = {
  crema: { ink: "#2b211e", cream: "#f6f1e8", accent: "#6e2b35", muted: "#e8dfd0", deep: "#6e2b35", accentInk: "#f6f1e8" },
  oliva: { ink: "#191b17", cream: "#f3eee5", accent: "#d7ff43", muted: "#ccd1ba", deep: "#5a6a32", accentInk: "#191b17" },
  vino: { ink: "#24191c", cream: "#f4ece8", accent: "#ffb6c8", muted: "#d7c0c5", deep: "#7c3140", accentInk: "#24191c" },
  cobalto: { ink: "#111c38", cream: "#f0f2ed", accent: "#ffcc33", muted: "#bfc9d8", deep: "#22355f", accentInk: "#111c38" },
};

const DEMO_DEFAULTS = {
  brand: "FASHION MARKET",
  eyebrow: "Nueva temporada · Otoño – Invierno 2026",
  headline: "Tu estilo,",
  highlight: "mejor elegido.",
  description: "Descubrí la colección de esta temporada y probá combinaciones pensadas especialmente para vos.",
  theme: "crema",
  type: "editorial",
  hero: "/fashion/hero-olive.png",
};


function readEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}


function persistEdit(item) {
  const edits = readEdits();
  edits[item.id] = {
    name: item.name || "",
    part: item.part,
    garmentType: normalizeGarmentType(item.garmentType, item.part),
    gender: inferGarmentGender(item),
    color: item.color || null,
    secondaryColor: item.secondaryColor || null,
    tags: item.tags || [],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function removePersistedEdit(id) {
  const edits = readEdits();
  delete edits[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function readDeletedItems() {
  try {
    const value = JSON.parse(localStorage.getItem(DELETED_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function persistDeletedItem(id) {
  const deleted = readDeletedItems();
  deleted.add(id);
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...deleted]));
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(first, second) {
  return Math.sqrt(
    ((first.red - second.red) ** 2)
    + ((first.green - second.green) ** 2)
    + ((first.blue - second.blue) ** 2),
  );
}

function extractPalette(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 72) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${Math.round(red / 28)}-${Math.round(green / 28)}-${Math.round(blue / 28)}`;
    const current = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0 };
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.count += 1;
    buckets.set(key, current);
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const selected = [];
  for (const color of ranked) {
    if (selected.every((existing) => colorDistance(existing, color) > 38)) selected.push(color);
    if (selected.length === 5) break;
  }

  return selected.map((color) => rgbToHex(color.red, color.green, color.blue));
}

function buildSamplingCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function sampleImageColor(image, canvas, event) {
  const bounds = image.getBoundingClientRect();
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const imageX = Math.floor((event.clientX - bounds.left - offsetX) / scale);
  const imageY = Math.floor((event.clientY - bounds.top - offsetY) / scale);

  if (imageX < 0 || imageY < 0 || imageX >= canvas.width || imageY >= canvas.height) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let radius = 0; radius <= 18; radius += 2) {
    const startX = Math.max(0, imageX - radius);
    const startY = Math.max(0, imageY - radius);
    const width = Math.min(canvas.width - startX, (radius * 2) + 1);
    const height = Math.min(canvas.height - startY, (radius * 2) + 1);
    const data = context.getImageData(startX, startY, width, height).data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 96) return rgbToHex(data[index], data[index + 1], data[index + 2]);
    }
  }

  return null;
}

function GalleryItem({ item, selected, onOpen }) {
  const type = TYPE_MAP[item.part]?.singular || "prenda";

  return (
    <button
      className={`gallery-item${selected ? " selected" : ""}`}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`Ver ${item.name || type}`}
      aria-pressed={selected}
      data-testid={`wardrobe-item-${item.id}`}
    >
      <OptimizedImage
        src={item.thumbnail || item.image}
        alt=""
        sizes="(max-width: 520px) calc(50vw - 16px), (max-width: 860px) calc(33vw - 18px), 180px"
        breakpoints={[120, 180, 240, 320, 480]}
      />
    </button>
  );
}

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const nextTag = input.trim().replace(/^#/, "");
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return;
    onChange([...tags, nextTag]);
    setInput("");
  };

  return (
    <div className="tag-editor">
      <div className="editable-tags">
        {tags.map((tag) => (
          <span className="editable-tag" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={`Sacá ${tag}`}>
              <X size={12} weight="regular" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Agregá un detalle"
          aria-label="Agregá una etiqueta de detalle"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Agregá el detalle">
          <Plus size={15} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ColorControl({ label, field, value, palette, onChange, sampling, setSampling, optional = false, onClear, onAdd }) {
  if (optional && !value) {
    return (
      <div className="color-slot empty-color-slot">
        <div className="color-slot-heading">
          <span>{label}</span>
          <small>Opcional</small>
        </div>
        <p>No detectamos un color secundario diferente.</p>
        <button className="add-secondary-button" type="button" onClick={onAdd}>Agregá un color secundario</button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && <button type="button" onClick={onClear}>Sacá el color</button>}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Elegí ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Seleccionado</small>
          <strong>{value || "Personalizado"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Sugerencias de la imagen</span>
        <small>Hacé clic para aplicar</small>
      </div>
      <div className="palette" aria-label={`Sugerencias de ${label.toLowerCase()} tomadas de la imagen`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Usá ${color} como ${label.toLowerCase()}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        {sampling === field ? "Cancelá la selección" : `Elegí ${label.toLowerCase()} desde la imagen`}
      </button>
    </div>
  );
}

function ItemEditor({ draft, setDraft, palette, sampling, setSampling, sampleStatus }) {
  const suggestedSecondary = palette.find((color) => color.toLowerCase() !== draft.color?.toLowerCase()) || "#9a9286";

  return (
    <div className="item-editor">
      <label className="field">
        <span>Nombre</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder={TYPE_MAP[draft.part]?.singular || "Prenda"}
        />
      </label>

      <label className="field">
        <span>Categoría</span>
        <select value={draft.part} onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}>
          {TYPES.slice(1).map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Tipo de prenda</span>
        <select value={draft.garmentType} onChange={(event) => setDraft((current) => ({ ...current, garmentType: event.target.value }))}>
          {GARMENT_TYPES.map((type) => <option value={type} key={type}>{GARMENT_TYPE_LABELS[type]}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Género de la prenda</span>
        <select value={draft.gender} onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value }))}>
          {GENDER_OPTIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>

      <fieldset className="color-field">
        <legend>Colores</legend>
        <div className="colors-editor">
          <ColorControl
            label="Color principal"
            field="primary"
            value={draft.color}
            palette={palette}
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            sampling={sampling}
            setSampling={setSampling}
          />
          <ColorControl
            label="Color secundario"
            field="secondary"
            value={draft.secondaryColor}
            palette={palette}
            onChange={(secondaryColor) => setDraft((current) => ({ ...current, secondaryColor }))}
            sampling={sampling}
            setSampling={setSampling}
            optional
            onClear={() => setDraft((current) => ({ ...current, secondaryColor: null }))}
            onAdd={() => setDraft((current) => ({ ...current, secondaryColor: suggestedSecondary }))}
          />
        </div>
        <p className="color-help" aria-live="polite">{sampling ? "Hacé clic sobre la prenda para tomar el color." : sampleStatus || "El color principal se toma de la imagen. Sólo sugerimos un secundario cuando tiene una presencia visual clara."}</p>
      </fieldset>

      <div className="field details-field">
        <span>Detalles</span>
        <TagEditor tags={draft.tags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} />
      </div>
    </div>
  );
}

function GarmentRegenerationPanel({ item, onApproved }) {
  const [state, setState] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    fetch(`/api/garment-regeneration/${item.id}`, { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || "No se pudo consultar la regeneración.");
        setState(value);
      })
      .catch((requestError) => setMessage(requestError.message));
  }, [item.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!["pending", "processing"].includes(state?.latest?.status)) return undefined;
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [refresh, state?.latest?.status]);

  const post = async (action, payload = {}) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/garment-regeneration/${item.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "No se pudo completar la acción.");
      setState(value);
      if (action === "request") setMessage(value.generationMode === "api"
        ? "La nueva imagen está lista. Revisala antes de aprobarla."
        : "La nueva versión quedó en proceso y aparecerá acá cuando esté lista.");
      if (action === "approve") { setMessage("Nueva imagen aprobada y versión anterior archivada."); onApproved?.(); }
      if (action === "reject") setMessage("Versión descartada. La imagen actual no cambió.");
    } catch (requestError) { setMessage(requestError.message); }
    finally { setBusy(false); }
  };

  const latest = state?.latest;
  const waiting = ["pending", "processing"].includes(latest?.status);
  const ready = latest?.status === "ready_for_review" && latest.candidateImage;
  const statusLabel = {
    pending: "pendiente",
    processing: "procesando",
    ready_for_review: "lista para revisar",
    approved: "aprobada",
    rejected: "descartada",
    failed: "con error",
  }[latest?.status] || "";

  return (
    <section className="garment-regeneration-panel">
      <div className="regeneration-heading">
        <div><span>Imagen de producto</span><h3>Regeneración de la prenda</h3></div>
        {latest?.status && <small data-status={latest.status}>{statusLabel}</small>}
      </div>
      <p>La imagen actual se conserva. Cada resultado queda en revisión y sólo reemplaza el catálogo después de aprobarlo.</p>
      {ready && (
        <div className="regeneration-compare">
          <figure><img src={item.image} alt={`Imagen actual de ${item.name}`} /><figcaption>Actual</figcaption></figure>
          <figure><img src={latest.candidateImage} alt={`Nueva versión de ${item.name}`} /><figcaption>Nueva versión</figcaption></figure>
        </div>
      )}
      {!ready && (
        <label className="regeneration-instruction">
          <span>Corrección opcional</span>
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ej.: conservar exactamente el ancho del cuello y los seis botones oscuros." maxLength={1200} />
        </label>
      )}
      {message && <p className="regeneration-message" role="status">{message}</p>}
      <div className="regeneration-actions">
        {ready ? (
          <>
            <button type="button" disabled={busy} onClick={() => post("reject", { requestId: latest.id })}>Descartar</button>
            <button className="approve" type="button" disabled={busy} onClick={() => post("approve", { requestId: latest.id })}><Check size={15} /> Aprobar imagen</button>
          </>
        ) : (
          <button className="approve" type="button" disabled={busy || waiting} onClick={() => post("request", { instruction })}>
            <ArrowCounterClockwise size={15} /> {waiting
              ? "Generando imagen…"
              : latest ? "Generá otra versión" : "Regenerá esta prenda"}
          </button>
        )}
      </div>
    </section>
  );
}

function ItemViewer({ item, onClose, onSave, onDelete, onRegenerationApproved }) {
  const closeButtonRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const [sampling, setSampling] = useState(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState(item.palette || []);
  const [draft, setDraft] = useState({ name: item.name || "", part: item.part, garmentType: normalizeGarmentType(item.garmentType, item.part), gender: inferGarmentGender(item), color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const type = TYPE_MAP[item.part]?.singular || "Prenda";
  const hasModeledImage = Boolean(item.modeledImage);
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const isDirty = useMemo(() => {
    const normalizedTags = (tags) => tags.map((tag) => tag.trim()).filter(Boolean);
    return JSON.stringify({
      name: draft.name.trim(),
      part: draft.part,
      garmentType: draft.garmentType,
      gender: draft.gender,
      color: draft.color?.toLowerCase() || null,
      secondaryColor: draft.secondaryColor?.toLowerCase() || null,
      tags: normalizedTags(draft.tags),
    }) !== JSON.stringify({
      name: (item.name || "").trim(),
      part: item.part,
      garmentType: normalizeGarmentType(item.garmentType, item.part),
      gender: inferGarmentGender(item),
      color: item.color?.toLowerCase() || null,
      secondaryColor: item.secondaryColor?.toLowerCase() || null,
      tags: normalizedTags(item.tags || []),
    });
  }, [draft, item]);

  const nudgeUnsaved = useCallback(() => {
    setCloseBlocked(true);
    setShaking(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShaking(true));
    });
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setShaking(false), 420);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirty) nudgeUnsaved();
    else onClose();
  }, [isDirty, nudgeUnsaved, onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (sampling) setSampling(null);
        else requestClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("viewer-open");
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open");
      clearTimeout(shakeTimerRef.current);
    };
  }, [requestClose, sampling]);

  useEffect(() => {
    if (!isDirty) setCloseBlocked(false);
  }, [isDirty]);

  useEffect(() => {
    setSampling(null);
    setSampleStatus("");
    setPalette(item.palette || []);
    setDraft({ name: item.name || "", part: item.part, garmentType: normalizeGarmentType(item.garmentType, item.part), gender: inferGarmentGender(item), color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
  }, [item]);

  const cancelEditing = () => {
    setDraft({ name: item.name || "", part: item.part, garmentType: normalizeGarmentType(item.garmentType, item.part), gender: inferGarmentGender(item), color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = () => {
    onSave({ ...item, ...draft, name: draft.name.trim(), tags: draft.tags.map((tag) => tag.trim()).filter(Boolean) });
    setSampling(null);
    setSampleStatus("Changes saved.");
  };

  const handleImageLoad = (event) => {
    samplingCanvasRef.current = buildSamplingCanvas(event.currentTarget);
    const extracted = extractPalette(event.currentTarget);
    setPalette([...new Set([...(item.palette || []), ...extracted])].slice(0, 5));
  };

  const handleImageClick = (event) => {
    if (!sampling || !samplingCanvasRef.current) return;
    const color = sampleImageColor(event.currentTarget, samplingCanvasRef.current, event);
    if (!color) {
      setSampleStatus("Ese punto es transparente. Probá directamente sobre la prenda.");
      return;
    }
    const targetField = sampling === "secondary" ? "secondaryColor" : "color";
    setDraft((current) => ({ ...current, [targetField]: color }));
    setPalette((current) => [color, ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase())].slice(0, 5));
    setSampleStatus(`Tomamos ${color} como color ${sampling === "secondary" ? "secundario" : "principal"}.`);
    setSampling(null);
  };

  const garmentArtwork = (
    <div
      className={`viewer-art${hasModeledImage ? " viewer-art-floating" : ""}${sampling ? " sampling" : ""}`}
      style={hasModeledImage ? { "--piece-rotation": pieceRotation } : undefined}
    >
      <OptimizedImage
        ref={imageRef}
        src={item.image}
        alt={`${type} seleccionada`}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Hacé clic sobre la prenda</span>}
    </div>
  );

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <div className="viewer-entry">
    <aside className={`viewer editing${hasModeledImage ? " has-modeled-image" : ""}${shaking ? " shake" : ""}`} role="dialog" aria-modal="true" aria-label="Prenda seleccionada">
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label="Cerrá el detalle" ref={closeButtonRef}>
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasModeledImage ? (
        <div className="modeled-hero">
          <OptimizedImage
            className="modeled-hero-photo"
            src={item.modeledImage}
            alt={`${draft.name || type} usada por una modelo`}
            sizes="(max-width: 860px) 100vw, 520px"
            breakpoints={[320, 480, 640, 800, 1040, 1280]}
            quality={82}
            priority
          />
          <div className="viewer-heading modeled-heading">
            <div>
              <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
            </div>
          </div>
          {garmentArtwork}
        </div>
      ) : (
        <>
          <div className="viewer-heading">
            <div>
              <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
            </div>
          </div>
          {garmentArtwork}
        </>
      )}

      <div className="viewer-details editing">
        <ItemEditor
          draft={draft}
          setDraft={setDraft}
          palette={palette}
          sampling={sampling}
          setSampling={setSampling}
          sampleStatus={sampleStatus}
        />

        <GarmentRegenerationPanel item={item} onApproved={onRegenerationApproved} />

        {closeBlocked && <p className="unsaved-notice" role="status">Guardá o cancelá los cambios antes de cerrar.</p>}

        <div className="viewer-actions">
          <button className="delete-button" type="button" onClick={() => onDelete(item.id)}>
            <Trash size={15} weight="regular" aria-hidden="true" /> Eliminá
          </button>
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={cancelEditing}>Cancelá</button>
          <button className="primary-button" type="button" onClick={saveEditing}>
            <Check size={15} weight="bold" aria-hidden="true" /> Guardá
          </button>
        </div>
      </div>
    </aside>
    </div>
    </div>
  );
}

const FOOTER_CONTACT = {
  email: "info@marketplace.com.py",
  facebookUrl: "https://www.facebook.com/fashionmarketpy/",
  facebookLabel: "Fashionmarketpy",
  instagramUrl: "https://www.instagram.com/fashionmarket_py/",
  instagramLabel: "@fashionmarket_py",
};

function RetailFooter({ brand, tagline }) {
  return (
    <footer className="retail-footer">
      <div className="retail-footer__top">
        <div className="brand-mark"><BrandLogo /><small>By Marketplace</small></div>
        <p>{tagline}</p>
        <small>Otoño — Invierno 2026</small>
      </div>
      <div className="retail-footer__columns">
        <section>
          <h3>Horario de Atención</h3>
          <p><strong>Central:</strong></p>
          <p>Lun a Sáb: 9:00 a 20:00hs</p>
          <p>Dom: 10:00 a 20:00hs</p>
          <p><strong>San Bernardino:</strong></p>
          <p>Solo abierto en Temporada</p>
        </section>
        <section>
          <h3>Contacto</h3>
          <a className="retail-social" href={`mailto:${FOOTER_CONTACT.email}`}>
            <EnvelopeSimple size={16} /> {FOOTER_CONTACT.email}
          </a>
        </section>
        <section>
          <h3>Encontranos en</h3>
          <a className="retail-social" href={FOOTER_CONTACT.facebookUrl} target="_blank" rel="noreferrer" aria-label="Facebook de Fashion Market">
            <FacebookLogo size={16} /> {FOOTER_CONTACT.facebookLabel}
          </a>
          <a className="retail-social" href={FOOTER_CONTACT.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram de Fashion Market">
            <InstagramLogo size={16} /> {FOOTER_CONTACT.instagramLabel}
          </a>
        </section>
      </div>
      <p className="retail-footer__legal">© 2026 Fashion Market. Todos los derechos reservados.</p>
    </footer>
  );
}

const WINTER_PROMO_SEEN_KEY = "fm-winter-sale-promo-v1";

function WinterSaleDialog({ onClose, onDiscover }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="winter-promo__backdrop" onClick={onClose}>
      <div
        className="winter-promo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="winter-promo-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeButtonRef} className="winter-promo__close" type="button" onClick={onClose} aria-label="Cerrar aviso">
          <X size={16} />
        </button>
        <p className="retail-kicker"><Sparkle size={14} weight="fill" /> Winter Sale · Hasta 50% Off</p>
        <h2 id="winter-promo-title">El invierno, <em>con hasta 50% off.</em></h2>
        <p>Hasta el 31 de agosto, una selección de prendas de invierno con hasta 50% de descuento.</p>
        <div className="winter-promo__actions">
          <button className="retail-primary-button" type="button" onClick={onDiscover}>
            Descubrí la selección <ArrowRight size={16} />
          </button>
          <button className="retail-text-link winter-promo__dismiss" type="button" onClick={onClose}>
            Seguir explorando
          </button>
        </div>
      </div>
    </div>
  );
}

export function App({ initialView = "home", onNavigate, tryOnInitialSection = "suggestions" }) {
  const [view, setView] = useState(initialView);
  const demo = DEMO_DEFAULTS;
  const [importLaunch, setImportLaunch] = useState(0);
  const [items, setItems] = useState([]);
  const [activeType, setActiveType] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Ficha pública de producto: pila de ids para poder volver desde una sugerencia.
  const [productTrail, setProductTrail] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("producto");
    return fromUrl ? [fromUrl] : [];
  });
  const openProduct = (id) => setProductTrail((trail) => (trail[trail.length - 1] === id ? trail : [...trail, id]));
  const closeProduct = () => setProductTrail([]);
  const selectedProduct = (view === "collection" && items.find((item) => item.id === productTrail[productTrail.length - 1])) || null;

  useEffect(() => {
    if (view !== "collection") return;
    const url = new URL(window.location.href);
    if (selectedProduct) url.searchParams.set("producto", selectedProduct.id);
    else url.searchParams.delete("producto");
    window.history.replaceState(null, "", url);
  }, [view, selectedProduct]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Aviso emergente del Winter Sale: una vez por sesión, al entrar a la landing.
  const [showWinterPromo, setShowWinterPromo] = useState(false);
  useEffect(() => {
    if (view !== "home") return;
    let seen = false;
    try { seen = sessionStorage.getItem(WINTER_PROMO_SEEN_KEY) === "1"; } catch { /* modo privado */ }
    if (seen) return;
    const timer = setTimeout(() => setShowWinterPromo(true), 1800);
    return () => clearTimeout(timer);
  }, [view]);
  const dismissWinterPromo = useCallback(() => {
    setShowWinterPromo(false);
    try { sessionStorage.setItem(WINTER_PROMO_SEEN_KEY, "1"); } catch { /* modo privado */ }
  }, []);
  const discoverWinterPromo = () => {
    dismissWinterPromo();
    document.getElementById("winter-sale")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const changeView = (nextView) => {
    setView(nextView);
    onNavigate?.(nextView);
  };

  useEffect(() => {
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("No pudimos cargar la colección.");
        return response.json();
      })
      .then((loadedItems) => {
        const edits = readEdits();
        const deleted = readDeletedItems();
        const visibleItems = loadedItems.filter((item) => !deleted.has(item.id));
        setItems(visibleItems.map((item) => ({ ...item, ...(edits[item.id] || {}) })));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const visibleItems = useMemo(() => {
    const filtered = activeType === "all" ? items : items.filter((item) => item.part === activeType);
    return [...filtered].sort((a, b) => {
      if (activeType === "all") {
        const typeDifference = (TYPE_ORDER[a.part] ?? 99) - (TYPE_ORDER[b.part] ?? 99);
        if (typeDifference) return typeDifference;
      }
      return a.id.localeCompare(b.id);
    });
  }, [activeType, items]);

  const chooseType = (typeId) => {
    setActiveType(typeId);
    setSelectedId(null);
  };

  const saveItem = (updatedItem) => {
    setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item));
    persistEdit(updatedItem);
  };

  const deleteItem = async (id) => {
    if (id.startsWith("import-")) {
      try {
        const response = await fetch(`/api/import/wardrobe/${id}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error("No pudimos eliminar la prenda importada.");
      } catch (requestError) {
        setError(requestError.message);
        return;
      }
    }
    setItems((current) => current.filter((item) => item.id !== id));
    removePersistedEdit(id);
    persistDeletedItem(id);
    setSelectedId(null);
  };

  const addImportedItem = useCallback((newItem) => {
    setItems((current) => current.some((item) => item.id === newItem.id) ? current : [...current, newItem]);
  }, []);

  const attachImportedModeledImage = useCallback((jobId, modeledImage) => {
    const id = `import-${jobId}`;
    setItems((current) => current.map((item) => item.id === id ? { ...item, modeledImage } : item));
  }, []);

  const showcaseItems = useMemo(() => {
    const modeled = items.filter((item) => item.modeledImage);
    return (modeled.length >= 3 ? modeled : items).slice(0, 3);
  }, [items]);

  // Selección del Winter Sale: prioriza season "winter" y después prendas aptas
  // para frío (climates "cold"), dejando fuera los accesorios.
  const winterItems = useMemo(() => {
    const winterScore = (item) => {
      if (item.season === "winter") return 0;
      if (!(item.climates || []).includes("cold")) return null;
      if (item.weight === "heavy") return 1;
      return item.weight === "medium" ? 2 : 3;
    };
    const seenNames = new Set();
    return items
      .filter((item) => !String(item.part || "").startsWith("accessories"))
      .map((item) => ({ item, score: winterScore(item) }))
      .filter(({ item, score }) => {
        if (score === null || seenNames.has(item.name)) return false;
        seenNames.add(item.name);
        return true;
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 14)
      .map(({ item }) => item);
  }, [items]);

  const activeTheme = DEMO_THEMES[demo.theme];
  const themeStyle = { "--ink": activeTheme.ink, "--cream": activeTheme.cream, "--acid": activeTheme.accent, "--muted": activeTheme.muted, "--deep": activeTheme.deep, "--accent-ink": activeTheme.accentInk };
  const openCollection = (type = "all") => {
    setActiveType(type);
    setSelectedId(null);
    changeView("collection");
  };
  const refreshItems = () => {
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => response.json())
      .then((loadedItems) => {
        const edits = readEdits();
        const deleted = readDeletedItems();
        setItems(loadedItems.filter((candidate) => !deleted.has(candidate.id)).map((candidate) => ({ ...candidate, ...(edits[candidate.id] || {}) })));
      });
  };

  if (view === "home") {
    return (
      <div
        className={`retail-landing type-${demo.type}`}
        style={themeStyle}
      >
        <FashionIntro />
        <header className="retail-nav" id="inicio">
          <button className="brand-mark" type="button" onClick={() => changeView("home")} aria-label="Inicio">
            <BrandLogo /><small>By Marketplace</small>
          </button>
          <nav aria-label="Navegación principal">
            <a href="#temporada">Temporada</a>
            <a href="#probador">Probador</a>
          </nav>
          <div className="retail-nav-actions">
            <button className="retail-outline-button" type="button" onClick={() => openCollection()}>Colección</button>
          </div>
        </header>

        <main>
          <section className="retail-hero">
            <div className="hero-copy">
              <p className="retail-kicker"><Sparkle size={15} weight="fill" /> {demo.eyebrow}</p>
              <h1>{demo.headline}<br /><em>{demo.highlight}</em></h1>
              <p className="hero-description">{demo.description}</p>
              <div className="hero-actions">
                <button className="retail-primary-button" type="button" onClick={() => openCollection()}>
                  Conocé la colección <ArrowRight size={18} />
                </button>
                <a className="retail-text-link" href="#temporada">Descubrí la temporada</a>
              </div>
              <div className="hero-proof">
                <span><strong>01</strong> Paleta mineral</span>
                <span><strong>02</strong> Capas livianas</span>
                <span><strong>03</strong> Sastrería relajada</span>
              </div>
            </div>

            <div className="hero-editorial" aria-label="Selección editorial de moda">
              <div className="editorial-card editorial-main">
                <img src={demo.hero} alt="Look editorial de la colección" />
                <span className="editorial-label">Nueva colección · 26</span>
              </div>
              <div className="editorial-card editorial-small">
                <img src="/fashion/look-burgundy.png" alt="Segundo look de la colección" />
              </div>
              <p className="vertical-note">CURADURÍA PERSONAL · TODOS LOS DÍAS</p>
            </div>
          </section>

          <section className="season-story" id="temporada">
            <div className="season-story__image"><img src="/fashion/look-camel.png" alt="Look de la temporada otoño invierno 2026" /></div>
            <div className="season-story__copy">
              <p className="retail-kicker">Otoño — Invierno 2026</p>
              <h2>La temporada se construye en capas.</h2>
              <p>Descubrí una edición pensada para acompañarte del día a la noche: tonos tierra, acentos profundos y texturas que suman presencia sin perder comodidad.</p>
              <dl>
                <div><dt>Paleta</dt><dd>Arena, vino, azul noche y marfil.</dd></div>
                <div><dt>Siluetas</dt><dd>Volúmenes relajados y líneas definidas.</dd></div>
                <div><dt>Materiales</dt><dd>Denim, tejidos suaves y abrigos con estructura.</dd></div>
              </dl>
            </div>
          </section>

          <section className="winter-sale" id="winter-sale" aria-label="Winter Sale">
            <p className="retail-kicker"><Sparkle size={15} weight="fill" /> Winter Sale · Hasta 50% Off</p>
            <h2>El invierno, <em>con hasta 50% off.</em></h2>
            <p>Hasta el 31 de agosto, una selección de prendas de invierno con hasta 50% de descuento. Piezas pensadas para durar, en una ocasión que no.</p>
            <button className="retail-text-link winter-sale__link" type="button" onClick={() => openCollection()}>
              Descubrí la selección <ArrowRight size={16} />
            </button>
          </section>

          {winterItems.length > 3 && (
            <section className="winter-carousel" aria-label="Prendas seleccionadas del Winter Sale">
              <div className="winter-carousel__track" style={{ "--marquee-duration": `${winterItems.length * 4}s` }}>
                {[0, 1].map((copy) => (
                  <div className="winter-carousel__group" key={copy} aria-hidden={copy === 1 || undefined}>
                    {winterItems.map((item) => (
                      <button
                        className="winter-carousel__card"
                        type="button"
                        key={`${copy}-${item.id}`}
                        tabIndex={copy === 1 ? -1 : undefined}
                        onClick={() => { openProduct(item.id); openCollection(); }}
                        aria-label={`Ver ${item.name} en la colección`}
                      >
                        <span className="winter-carousel__image">
                          <OptimizedImage src={item.thumbnail || item.image} alt="" sizes="200px" breakpoints={[160, 240, 320]} />
                        </span>
                        <span className="winter-carousel__name">{item.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="collection-strip" id="coleccion">
            <div>
              <p className="retail-kicker">Selección de temporada</p>
              <h2>Encontrá tu próxima pieza esencial.</h2>
            </div>
            <div className="collection-categories">
              {TYPES.slice(1, 5).map((type, index) => (
                <button key={type.id} type="button" onClick={() => openCollection(type.id)}>
                  <span>0{index + 1}</span>{type.label}<ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>

          <section className="customize-cta" id="probador">
            <p className="retail-kicker"><Sparkle size={15} weight="fill" /> Probador virtual</p>
            <h2>Explorá nuevas formas<br /><em>de llevar cada look.</em></h2>
            <p>Cuando quieras probar una combinación, elegí uno de nuestros modelos IA predeterminados y mirá cómo se integra el look completo.</p>
            <button className="retail-primary-button" type="button" onClick={() => changeView("wardrobe")}>
              Abrí el probador <ArrowRight size={18} />
            </button>
          </section>
        </main>

        <RetailFooter brand={demo.brand} tagline="Descubrí la temporada, conocé sus piezas y encontrá tu propia forma de llevarlas." />
        {showWinterPromo && <WinterSaleDialog onClose={dismissWinterPromo} onDiscover={discoverWinterPromo} />}
      </div>
    );
  }

  if (view === "collection") {
    return (
      <div className={`retail-landing retail-subpage type-${demo.type}`} style={themeStyle}>
        <header className="retail-nav retail-subnav">
          <button className="brand-mark" type="button" onClick={() => changeView("home")} aria-label="Volvé al inicio">
            <BrandLogo /><small>By Marketplace</small>
          </button>
          <nav aria-label="Navegación de la colección">
            <button type="button" onClick={() => changeView("home")}>Inicio</button>
            <button type="button" onClick={() => changeView("wardrobe")}>Probador</button>
          </nav>
          <button className="retail-outline-button is-current" type="button">Colección</button>
        </header>
        <main className="public-catalog">
          <header className="public-catalog__heading">
            <div><p className="retail-kicker">Otoño — Invierno 2026</p><h1>Conocé la colección.</h1></div>
            <p>Explorá las prendas disponibles esta temporada. Después vas a poder combinarlas libremente desde el probador.</p>
          </header>
          <nav className="catalog-filters" aria-label="Filtrá la colección">
            {TYPES.map((type) => <button key={type.id} className={activeType === type.id ? "active" : ""} type="button" onClick={() => setActiveType(type.id)}>{type.label}</button>)}
          </nav>
          {visibleItems.length ? (
            <div className="public-product-grid">
              {visibleItems.map((item) => (
                <button className="public-product-card" type="button" key={item.id} onClick={() => openProduct(item.id)} aria-label={`Ver detalles de ${item.name}`}>
                  <div><OptimizedImage src={item.thumbnail || item.image} alt={item.name} sizes="(max-width: 640px) 50vw, (max-width: 1000px) 33vw, 25vw" breakpoints={[240, 360, 480, 640]} /><i style={{ background: item.color }} /></div>
                  <p>{SEASON_LABELS[item.season] || item.season} · {TYPE_MAP[item.part]?.singular}</p>
                  <h2>{item.name}</h2>
                  <small>{MATERIAL_LABELS[item.material] || item.material} · {SILHOUETTE_LABELS[item.silhouette] || item.silhouette}</small>
                </button>
              ))}
            </div>
          ) : <div className="catalog-empty"><h2>Esta categoría se está preparando.</h2><p>Volvé pronto para conocer las próximas piezas.</p></div>}
        </main>
        {selectedProduct && (
          <ProductSheet
            item={selectedProduct}
            items={items}
            onClose={closeProduct}
            onOpen={openProduct}
            onBack={productTrail.length > 1 ? () => setProductTrail((trail) => trail.slice(0, -1)) : undefined}
          />
        )}
        <RetailFooter brand={demo.brand} tagline="Una selección para descubrir a tu ritmo." />
      </div>
    );
  }

  if (view === "admin") {
    return (
      <div className={`app-shell retail-wardrobe admin-view${selectedItem ? " has-selection" : ""}`}>
        <header className="wardrobe-topbar">
          <button className="brand-mark" type="button" onClick={() => changeView("home")}><BrandLogo /><small>By Marketplace</small></button>
          <p>Administración del catálogo</p>
          <button className="retail-outline-button" type="button" onClick={() => changeView("home")}><List size={17} /> Mirá el sitio</button>
        </header>
        <main className="admin-catalog">
          <header><div><p>Gestión interna</p><h1>Catálogo de temporada</h1><span>Acá podés cargar, revisar, editar y regenerar las prendas que ve el público.</span></div><button type="button" onClick={() => setImportLaunch((value) => value + 1)}><UploadSimple size={18} /> Cargá productos</button></header>
          <nav className="catalog-filters" aria-label="Filtrá el catálogo administrativo">{TYPES.map((type) => <button key={type.id} className={activeType === type.id ? "active" : ""} type="button" onClick={() => chooseType(type.id)}>{type.label}</button>)}</nav>
          <div className="public-product-grid admin-product-grid">{visibleItems.map((item) => <button className="public-product-card" type="button" key={item.id} onClick={() => setSelectedId(item.id)}><div><OptimizedImage src={item.thumbnail || item.image} alt="" sizes="25vw" breakpoints={[240, 360, 480]} /><i style={{ background: item.color }} /></div><p>{item.season === "all" ? "Todo el año" : item.season} · {TYPE_MAP[item.part]?.singular}</p><h2>{item.name}</h2><small>{item.material} · {item.silhouette}</small></button>)}</div>
        </main>
        {selectedItem && <ItemViewer item={selectedItem} onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} onRegenerationApproved={refreshItems} />}
        <WardrobeImportFlow launch={importLaunch} onGarmentApproved={addImportedItem} onModeledApproved={attachImportedModeledImage} />
      </div>
    );
  }

  return (
    <div className={`app-shell retail-wardrobe${selectedItem ? " has-selection" : ""}`}>
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => changeView("home")}><BrandLogo /><small>By Marketplace</small></button>
        <p>Probador virtual</p>
        <button className="retail-outline-button" type="button" onClick={() => changeView("home")}><List size={17} /> Volvé al inicio</button>
      </header>
      {error && <p className="status error">{error}</p>}
      {loading
        ? <p className="status">Preparando el probador virtual…</p>
        : <VirtualTryOn items={items} initialSection={tryOnInitialSection} />}
    </div>
  );
}
