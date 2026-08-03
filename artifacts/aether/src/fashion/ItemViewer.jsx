import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, Plus, Trash, X } from "@phosphor-icons/react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { GARMENT_TYPES, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";

// Editor de prendas del panel /admin. Los cambios persisten en el servidor
// vía PATCH /api/import/wardrobe/:id (ver catalog-context.jsx).

const TYPES = [
  { id: "upperbody", label: "Prendas superiores", singular: "Prenda superior" },
  { id: "wholebody_up", label: "Abrigos", singular: "Abrigo" },
  { id: "lowerbody", label: "Prendas inferiores", singular: "Prenda inferior" },
  { id: "accessories_up", label: "Accesorios", singular: "Accesorio" },
  { id: "shoes", label: "Calzado", singular: "Calzado" },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));

const GENDERS = [["mujer", "Mujer"], ["hombre", "Hombre"], ["unisex", "Unisex"]];
const GARMENT_TYPE_LABELS = {
  top: "Top", blouse: "Blusa", shirt: "Camisa", tshirt: "Remera", sweater: "Suéter",
  dress: "Vestido", jumpsuit: "Enterizo", skirt: "Pollera", trousers: "Pantalón", jeans: "Jean",
  shorts: "Short", jacket: "Chaqueta", coat: "Abrigo", heels: "Tacones", shoes: "Calzado",
  bag: "Cartera / bolso", jewelry: "Joyería", belt: "Cinturón", scarf: "Pañuelo", hat: "Sombrero", other: "Otro",
};

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
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={`Quitar ${tag}`}>
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
          placeholder="Agregar un detalle"
          aria-label="Agregar etiqueta"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Agregar detalle">
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
        <p>No se detectó un color secundario distinto.</p>
        <button className="add-secondary-button" type="button" onClick={onAdd}>Agregar color secundario</button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && <button type="button" onClick={onClear}>Quitar</button>}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Elegir ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Seleccionado</small>
          <strong>{value || "Personalizado"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Sugerencias de la imagen</span>
        <small>Click para aplicar</small>
      </div>
      <div className="palette" aria-label={`Sugerencias de ${label.toLowerCase()}`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Usar ${color}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        {sampling === field ? "Cancelar" : `Tomar ${label.toLowerCase()} de la imagen`}
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

      <div className="field-row">
        <label className="field">
          <span>Categoría</span>
          <select value={draft.part} onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}>
            {TYPES.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Género</span>
          <select value={draft.gender} onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value }))}>
            {GENDERS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Tipo de prenda</span>
        <select value={draft.garmentType} onChange={(event) => setDraft((current) => ({ ...current, garmentType: event.target.value }))}>
          {GARMENT_TYPES.map((type) => <option value={type} key={type}>{GARMENT_TYPE_LABELS[type]}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Talles (separados por coma)</span>
        <input
          value={draft.sizesText}
          onChange={(event) => setDraft((current) => ({ ...current, sizesText: event.target.value }))}
          placeholder="S, M, L"
        />
      </label>

      <label className="field">
        <span>Descripción</span>
        <textarea
          rows="3"
          value={draft.description}
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
          placeholder="Descripción que ve el cliente en la ficha del producto"
        />
      </label>

      <fieldset className="color-field">
        <legend>Colores</legend>
        <div className="colors-editor">
          <ColorControl
            label="Color primario"
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
        <p className="color-help" aria-live="polite">{sampling ? "Hacé click sobre la prenda para tomar el color." : sampleStatus || "Los colores se usan para las sugerencias de \"Combina con\" y los outfits."}</p>
      </fieldset>

      <div className="field details-field">
        <span>Detalles</span>
        <TagEditor tags={draft.tags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} />
      </div>
    </div>
  );
}

function draftFrom(item) {
  return {
    name: item.name || "",
    part: item.part,
    garmentType: normalizeGarmentType(item.garmentType, item.part),
    color: item.color || "#9a9286",
    secondaryColor: item.secondaryColor || null,
    tags: [...(item.tags || [])],
    gender: inferGarmentGender(item),
    sizesText: (item.sizes || []).join(", "),
    description: item.description || "",
  };
}

function normalizedDraft(draft) {
  return {
    name: draft.name.trim(),
    part: draft.part,
    garmentType: draft.garmentType,
    color: draft.color?.toLowerCase() || null,
    secondaryColor: draft.secondaryColor?.toLowerCase() || null,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    gender: draft.gender,
    sizes: draft.sizesText.split(",").map((size) => size.trim()).filter(Boolean),
    description: draft.description.trim(),
  };
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
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/garment-regeneration/${item.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "No se pudo completar la acción.");
      setState(value);
      if (action === "request") {
        setMessage(value.generationMode === "api"
          ? "La nueva imagen está lista. Revisala antes de aprobarla."
          : "La nueva versión quedó en proceso y aparecerá acá cuando esté lista.");
      }
      if (action === "approve") {
        setMessage("Nueva imagen aprobada y versión anterior archivada.");
        onApproved?.();
      }
      if (action === "reject") setMessage("Versión descartada. La imagen actual no cambió.");
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
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
      <p>La imagen actual se conserva. El resultado solamente reemplaza el catálogo después de que lo apruebes.</p>
      {ready && (
        <div className="regeneration-compare">
          <figure><img src={item.image} alt={`Imagen actual de ${item.name}`} /><figcaption>Actual</figcaption></figure>
          <figure><img src={latest.candidateImage} alt={`Nueva versión de ${item.name}`} /><figcaption>Nueva versión</figcaption></figure>
        </div>
      )}
      {!ready && (
        <label className="regeneration-instruction">
          <span>Corrección opcional</span>
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ej.: conservá exactamente el cuello, los cierres y el estampado." maxLength={1200} />
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
            <ArrowCounterClockwise size={15} /> {waiting ? "Generando imagen…" : latest ? "Generá otra versión" : "Regenerá esta prenda"}
          </button>
        )}
      </div>
    </section>
  );
}

export function ItemViewer({ item, modelImage, onClose, onSave, onDelete, onRegenerationApproved }) {
  const closeButtonRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const [sampling, setSampling] = useState(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState(item.palette || []);
  const [draft, setDraft] = useState(draftFrom(item));
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const type = TYPE_MAP[item.part]?.singular || "Prenda";
  const heroImage = item.modeledImage || modelImage;
  const hasModeledImage = Boolean(heroImage);
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const isDirty = useMemo(() => JSON.stringify(normalizedDraft(draft)) !== JSON.stringify(normalizedDraft(draftFrom(item))), [draft, item]);

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
    setDraft(draftFrom(item));
  }, [item]);

  const cancelEditing = () => {
    setDraft(draftFrom(item));
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = async () => {
    setSaving(true);
    try {
      await onSave({ ...item, ...normalizedDraft(draft) });
      setSampling(null);
      setSampleStatus("Cambios guardados.");
    } catch (saveError) {
      setSampleStatus(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageLoad = (event) => {
    samplingCanvasRef.current = buildSamplingCanvas(event.currentTarget);
    const extracted = extractPalette(event.currentTarget);
    setPalette([...new Set([...(item.palette || []), ...extracted])].slice(0, 5));  };

  const handleImageClick = (event) => {
    if (!sampling || !samplingCanvasRef.current) return;
    const color = sampleImageColor(event.currentTarget, samplingCanvasRef.current, event);
    if (!color) {
      setSampleStatus("Ese punto es transparente: probá directamente sobre la prenda.");
      return;
    }
    const targetField = sampling === "secondary" ? "secondaryColor" : "color";
    setDraft((current) => ({ ...current, [targetField]: color }));
    setPalette((current) => [color, ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase())].slice(0, 5));
    setSampleStatus(`Se tomó ${color} de la imagen.`);
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
        alt={type}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Click en la prenda para tomar el color</span>}
    </div>
  );

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <div className="viewer-entry">
    <aside className={`viewer editing${hasModeledImage ? " has-modeled-image" : ""}${shaking ? " shake" : ""}`} role="dialog" aria-modal="true" aria-label="Prenda seleccionada">
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label="Cerrar editor" ref={closeButtonRef}>
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasModeledImage ? (
        <div className="modeled-hero">
          <OptimizedImage
            className="modeled-hero-photo"
            src={heroImage}
            alt={`Modelo elegida junto a ${draft.name || type}`}
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
            <Trash size={15} weight="regular" aria-hidden="true" /> Eliminar
          </button>
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={cancelEditing}>Cancelar</button>
          <button className="primary-button" type="button" disabled={saving} onClick={saveEditing}>
            <Check size={15} weight="bold" aria-hidden="true" /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </aside>
    </div>
    </div>
  );
}
