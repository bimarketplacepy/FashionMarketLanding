import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowRight, Check, Heart, List, Plus, SlidersHorizontal, Sparkle, Trash, X } from "@phosphor-icons/react";
import { WardrobeImportFlow } from "./import-flow.jsx";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { VirtualTryOn } from "./virtual-tryon.jsx";
import "./styles.css";

const STORAGE_KEY = "open-wardrobe-edits-v1";
const DELETED_STORAGE_KEY = "open-wardrobe-deleted-v1";

const TYPES = [
  { id: "all", label: "All" },
  { id: "upperbody", label: "Tops", singular: "Top" },
  { id: "wholebody_up", label: "Jackets", singular: "Jacket" },
  { id: "lowerbody", label: "Bottoms", singular: "Bottom" },
  { id: "accessories_up", label: "Accessories", singular: "Accessory" },
  { id: "shoes", label: "Shoes", singular: "Shoes" },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));
const TYPE_ORDER = Object.fromEntries(TYPES.slice(1).map((type, index) => [type.id, index]));

const DEMO_THEMES = {
  oliva: { ink: "#191b17", cream: "#f3eee5", accent: "#d7ff43", muted: "#ccd1ba" },
  vino: { ink: "#24191c", cream: "#f4ece8", accent: "#ffb6c8", muted: "#d7c0c5" },
  cobalto: { ink: "#111c38", cream: "#f0f2ed", accent: "#ffcc33", muted: "#bfc9d8" },
};

const DEMO_DEFAULTS = {
  brand: "FASHION MARKET",
  eyebrow: "Moda que aprende de vos",
  headline: "Tu estilo,",
  highlight: "mejor elegido.",
  description: "Descubrí prendas de nuestra colección, guardá tus favoritas y probá combinaciones pensadas para vos.",
  theme: "oliva",
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
  const type = TYPE_MAP[item.part]?.singular || "wardrobe item";

  return (
    <button
      className={`gallery-item${selected ? " selected" : ""}`}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`View ${item.name || type}`}
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
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={`Remove ${tag}`}>
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
          placeholder="Add a detail"
          aria-label="Add detail tag"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Add detail">
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
          <small>Optional</small>
        </div>
        <p>No distinct secondary color detected.</p>
        <button className="add-secondary-button" type="button" onClick={onAdd}>Add secondary color</button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && <button type="button" onClick={onClear}>Remove</button>}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Choose ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Selected</small>
          <strong>{value || "Custom"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Image suggestions</span>
        <small>Click to apply</small>
      </div>
      <div className="palette" aria-label={`${label} suggestions from image`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Use ${color} as ${label.toLowerCase()}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        {sampling === field ? "Cancel picking" : `Pick ${label.toLowerCase()} from image`}
      </button>
    </div>
  );
}

function ItemEditor({ draft, setDraft, palette, sampling, setSampling, sampleStatus }) {
  const suggestedSecondary = palette.find((color) => color.toLowerCase() !== draft.color?.toLowerCase()) || "#9a9286";

  return (
    <div className="item-editor">
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder={TYPE_MAP[draft.part]?.singular || "Wardrobe item"}
        />
      </label>

      <label className="field">
        <span>Category</span>
        <select value={draft.part} onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}>
          {TYPES.slice(1).map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
        </select>
      </label>

      <fieldset className="color-field">
        <legend>Colors</legend>
        <div className="colors-editor">
          <ColorControl
            label="Primary color"
            field="primary"
            value={draft.color}
            palette={palette}
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            sampling={sampling}
            setSampling={setSampling}
          />
          <ColorControl
            label="Secondary color"
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
        <p className="color-help" aria-live="polite">{sampling ? `Click anywhere on the garment to sample the ${sampling} color.` : sampleStatus || "Primary colors come from the image. A secondary is suggested only when a distinct color has meaningful coverage."}</p>
      </fieldset>

      <div className="field details-field">
        <span>Details</span>
        <TagEditor tags={draft.tags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} />
      </div>
    </div>
  );
}

function ItemViewer({ item, onClose, onSave, onDelete }) {
  const closeButtonRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const [sampling, setSampling] = useState(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState(item.palette || []);
  const [draft, setDraft] = useState({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const type = TYPE_MAP[item.part]?.singular || "Wardrobe item";
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
      color: draft.color?.toLowerCase() || null,
      secondaryColor: draft.secondaryColor?.toLowerCase() || null,
      tags: normalizedTags(draft.tags),
    }) !== JSON.stringify({
      name: (item.name || "").trim(),
      part: item.part,
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
    setDraft({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
  }, [item]);

  const cancelEditing = () => {
    setDraft({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
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
      setSampleStatus("That spot is transparent—try directly on the garment.");
      return;
    }
    const targetField = sampling === "secondary" ? "secondaryColor" : "color";
    setDraft((current) => ({ ...current, [targetField]: color }));
    setPalette((current) => [color, ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase())].slice(0, 5));
    setSampleStatus(`Sampled ${color} as the ${sampling} color.`);
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
        alt={`Selected ${type.toLowerCase()}`}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Click garment to sample</span>}
    </div>
  );

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <div className="viewer-entry">
    <aside className={`viewer editing${hasModeledImage ? " has-modeled-image" : ""}${shaking ? " shake" : ""}`} role="dialog" aria-modal="true" aria-label="Selected wardrobe item">
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label="Close viewer" ref={closeButtonRef}>
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasModeledImage ? (
        <div className="modeled-hero">
          <OptimizedImage
            className="modeled-hero-photo"
            src={item.modeledImage}
            alt={`${draft.name || type} worn by a model`}
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

        {closeBlocked && <p className="unsaved-notice" role="status">Save or cancel changes before closing.</p>}

        <div className="viewer-actions">
          <button className="delete-button" type="button" onClick={() => onDelete(item.id)}>
            <Trash size={15} weight="regular" aria-hidden="true" /> Delete
          </button>
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={cancelEditing}>Cancel</button>
          <button className="primary-button" type="button" onClick={saveEditing}>
            <Check size={15} weight="bold" aria-hidden="true" /> Save
          </button>
        </div>
      </div>
    </aside>
    </div>
    </div>
  );
}

export function FashionMarket({ intro }) {
  const [view, setView] = useState("home");
  const [demo, setDemo] = useState(DEMO_DEFAULTS);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [importLaunch, setImportLaunch] = useState(0);
  const [items, setItems] = useState([]);
  const [activeType, setActiveType] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the wardrobe.");
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
        if (!response.ok && response.status !== 404) throw new Error("Could not delete the imported item.");
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

  if (view === "home") {
    const activeTheme = DEMO_THEMES[demo.theme];
    return (
      <div
        className={`retail-landing type-${demo.type}`}
        style={{ "--ink": activeTheme.ink, "--cream": activeTheme.cream, "--acid": activeTheme.accent, "--muted": activeTheme.muted }}
      >
        {intro}
        <header className="retail-nav">
          <button className="brand-mark" type="button" onClick={() => setView("home")} aria-label="Inicio">
            <span>{demo.brand || "FASHION MARKET"}</span><small>By Marketplace</small>
          </button>
          <nav aria-label="Navegación principal">
            <a href="#coleccion">Colección</a>
            <a href="#experiencia">Experiencia</a>
            <a href="#como-funciona">Cómo funciona</a>
          </nav>
          <div className="retail-nav-actions">
            <button className="icon-action" type="button" aria-label="Favoritos"><Heart size={20} /></button>
            <button className="retail-outline-button" type="button" onClick={() => setView("wardrobe")}>Mi vestidor</button>
          </div>
        </header>

        <button className="demo-customize-trigger" type="button" onClick={() => setCustomizerOpen(true)}>
          <SlidersHorizontal size={18} /> Personalizar demo
        </button>

        <aside className={`demo-customizer${customizerOpen ? " is-open" : ""}`} aria-label="Personalizar la landing" aria-hidden={!customizerOpen}>
          <div className="demo-customizer__header">
            <div><p>Editor visual</p><h2>Hacela tuya</h2></div>
            <button type="button" onClick={() => setCustomizerOpen(false)} aria-label="Cerrar editor"><X size={20} /></button>
          </div>
          <div className="demo-customizer__body">
            <label><span>Nombre de marca</span><input value={demo.brand} maxLength={18} onChange={(event) => setDemo({ ...demo, brand: event.target.value.toUpperCase() })} /></label>
            <label><span>Texto superior</span><input value={demo.eyebrow} onChange={(event) => setDemo({ ...demo, eyebrow: event.target.value })} /></label>
            <label><span>Título</span><input value={demo.headline} onChange={(event) => setDemo({ ...demo, headline: event.target.value })} /></label>
            <label><span>Frase destacada</span><input value={demo.highlight} onChange={(event) => setDemo({ ...demo, highlight: event.target.value })} /></label>
            <label><span>Descripción</span><textarea rows="4" value={demo.description} onChange={(event) => setDemo({ ...demo, description: event.target.value })} /></label>
            <fieldset>
              <legend>Paleta</legend>
              <div className="theme-swatches">
                {Object.entries(DEMO_THEMES).map(([name, theme]) => (
                  <button className={demo.theme === name ? "active" : ""} type="button" key={name} onClick={() => setDemo({ ...demo, theme: name })}>
                    <i style={{ background: theme.ink }} /><i style={{ background: theme.cream }} /><i style={{ background: theme.accent }} /><span>{name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Tipografía</legend>
              <div className="segmented-control">
                <button className={demo.type === "editorial" ? "active" : ""} type="button" onClick={() => setDemo({ ...demo, type: "editorial" })}>Editorial</button>
                <button className={demo.type === "modern" ? "active" : ""} type="button" onClick={() => setDemo({ ...demo, type: "modern" })}>Moderna</button>
              </div>
            </fieldset>
            <fieldset>
              <legend>Imagen principal</legend>
              <div className="image-picker">
                {[
                  ["/fashion/hero-olive.png", "Oliva"],
                  ["/fashion/look-camel.png", "Camel"],
                  ["/fashion/look-burgundy.png", "Vino"],
                ].map(([src, label]) => <button className={demo.hero === src ? "active" : ""} type="button" key={src} onClick={() => setDemo({ ...demo, hero: src })}><img src={src} alt="" /><span>{label}</span></button>)}
              </div>
            </fieldset>
          </div>
          <div className="demo-customizer__footer">
            <button type="button" onClick={() => setDemo(DEMO_DEFAULTS)}><ArrowCounterClockwise size={15} /> Restablecer</button>
            <button type="button" onClick={() => setCustomizerOpen(false)}>Aplicar cambios</button>
          </div>
        </aside>
        {customizerOpen && <button className="demo-customizer-backdrop" type="button" onClick={() => setCustomizerOpen(false)} aria-label="Cerrar editor" />}

        <main>
          <section className="retail-hero">
            <div className="hero-copy">
              <p className="retail-kicker"><Sparkle size={15} weight="fill" /> {demo.eyebrow}</p>
              <h1>{demo.headline}<br /><em>{demo.highlight}</em></h1>
              <p className="hero-description">{demo.description}</p>
              <div className="hero-actions">
                <button className="retail-primary-button" type="button" onClick={() => setView("wardrobe")}>
                  Crear mi vestidor <ArrowRight size={18} />
                </button>
                <a className="retail-text-link" href="#coleccion">Explorar colección</a>
              </div>
              <div className="hero-proof">
                <span><strong>01</strong> Sumá tus prendas</span>
                <span><strong>02</strong> Combiná tu estilo</span>
                <span><strong>03</strong> Elegí mejor</span>
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

          <section className="collection-strip" id="coleccion">
            <div>
              <p className="retail-kicker">Selección de temporada</p>
              <h2>Encontrá tu próxima pieza esencial.</h2>
            </div>
            <div className="collection-categories">
              {TYPES.slice(1, 5).map((type, index) => (
                <button key={type.id} type="button" onClick={() => { setActiveType(type.id); setView("wardrobe"); }}>
                  <span>0{index + 1}</span>{type.label === "Tops" ? "Prendas superiores" : type.label === "Jackets" ? "Abrigos" : type.label === "Bottoms" ? "Prendas inferiores" : "Accesorios"}<ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>

          <section className="lookbook-section">
            <div className="lookbook-heading">
              <p className="retail-kicker">Looks reales, inspiración inmediata</p>
              <h2>La colección<br />en movimiento.</h2>
            </div>
            <article className="look-card look-card-one">
              <img src="/fashion/look-camel.png" alt="Look urbano con sobrecamisa camel" />
              <div><span>Look 01</span><strong>Esenciales urbanos</strong><button type="button" onClick={() => setView("wardrobe")}>Ver prendas <ArrowRight size={15} /></button></div>
            </article>
            <article className="look-card look-card-two">
              <img src="/fashion/look-burgundy.png" alt="Look elegante en tonos vino y taupe" />
              <div><span>Look 02</span><strong>Elegancia tonal</strong><button type="button" onClick={() => setView("wardrobe")}>Ver prendas <ArrowRight size={15} /></button></div>
            </article>
          </section>

          <section className="personalizer-feature" id="experiencia">
            <div className="personalizer-visual">
              <img className="wardrobe-studio-photo" src="/fashion/wardrobe-studio.png" alt="Selección de prendas dentro del vestidor inteligente" />
              <div className="stylist-badge"><Sparkle size={19} weight="fill" /><span>Stylist IA<br /><small>Siempre disponible</small></span></div>
            </div>
            <div className="personalizer-copy">
              <p className="retail-kicker">Tu vestidor inteligente</p>
              <h2>Todo lo que tenés.<br />Todo lo que <em>podés crear.</em></h2>
              <p>Subí una foto de tus prendas o elegí piezas de la tienda. Nuestro personalizador reconoce cada detalle y te ayuda a construir looks completos.</p>
              <ul id="como-funciona">
                <li><span>01</span><div><strong>Importá tus prendas</strong><small>Desde una foto, en segundos.</small></div></li>
                <li><span>02</span><div><strong>Organizá tu vestidor</strong><small>Por categoría, color y estilo.</small></div></li>
                <li><span>03</span><div><strong>Creá nuevos looks</strong><small>Con tus piezas y nuestra colección.</small></div></li>
              </ul>
              <button className="retail-primary-button dark" type="button" onClick={() => setView("wardrobe")}>Probar el personalizador <ArrowRight size={18} /></button>
            </div>
          </section>
        </main>

        <footer className="retail-footer">
          <div className="brand-mark"><span>FASHION MARKET</span><small>By Marketplace</small></div>
          <p>Una nueva forma de descubrir, combinar y comprar moda.</p>
          <button type="button" onClick={() => setView("wardrobe")}>Abrir mi vestidor <ArrowRight size={15} /></button>
        </footer>
      </div>
    );
  }

  return (
    <div className={`app-shell retail-wardrobe${selectedItem ? " has-selection" : ""}`}>
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => setView("home")}><span>FASHION MARKET</span><small>By Marketplace</small></button>
        <p>Mi vestidor personal</p>
        <button className="retail-outline-button" type="button" onClick={() => setView("home")}><List size={17} /> Volver a la tienda</button>
      </header>
      {error && <p className="status error">{error}</p>}
      {loading
        ? <p className="status">Preparando el probador virtual…</p>
        : <VirtualTryOn items={items} onAddProducts={() => setImportLaunch((value) => value + 1)} onOpenItem={setSelectedId} />}

      {selectedItem && <ItemViewer item={selectedItem} onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} />}
      <WardrobeImportFlow launch={importLaunch} onGarmentApproved={addImportedItem} onModeledApproved={attachImportedModeledImage} />
    </div>
  );
}
