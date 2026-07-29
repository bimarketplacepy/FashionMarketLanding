import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, MagicWand, SpinnerGap } from "@phosphor-icons/react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import "./virtual-tryon.css";

const PARTS = [
  ["upperbody", "Superior"],
  ["lowerbody", "Inferior"],
  ["wholebody_up", "Abrigo"],
  ["shoes", "Calzado"],
  ["accessories_up", "Accesorio"],
];

const FILTERS = {
  seasons: [["all", "Todo el año"], ["spring", "Primavera"], ["summer", "Verano"], ["autumn", "Otoño"], ["winter", "Invierno"]],
  occasions: [["casual", "Casual"], ["office", "Oficina"], ["event", "Evento"], ["weekend", "Fin de semana"], ["smart-casual", "Smart casual"]],
  climates: [["warm", "Cálido"], ["mild", "Templado"], ["cold", "Frío"], ["rain", "Lluvia"]],
};

const COMPLEXIONS = [
  ["esbelta", "Esbelta"],
  ["media", "Media"],
  ["atletica", "Atlética"],
  ["curvy", "Curvy"],
];

const SKIN_TONES = [
  ["clara", "Clara", "#f2d6c0"],
  ["media-clara", "Media clara", "#e0b394"],
  ["media", "Media", "#c68e64"],
  ["morena", "Morena", "#9c6743"],
  ["oscura", "Oscura", "#6b4630"],
];

const WEIGHT = { light: 1, medium: 2, heavy: 3 };
const NEUTRAL_SATURATION = 0.16;

function request(path, options) {
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  }).then(async (response) => {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || "No se pudo completar la acción.");
    return value;
  });
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
  reader.readAsDataURL(file);
});

function hexToHsl(hex = "#777777") {
  const value = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return { hue: hue < 0 ? hue + 360 : hue, saturation: delta / (1 - Math.abs(max + min - 1) || 1), lightness: (max + min) / 2 };
}

function colorCompatibility(first, second) {
  const a = hexToHsl(first);
  const b = hexToHsl(second);
  if (a.saturation < NEUTRAL_SATURATION || b.saturation < NEUTRAL_SATURATION) return { score: 18, label: "base neutra versátil" };
  const difference = Math.abs(a.hue - b.hue);
  const distance = Math.min(difference, 360 - difference);
  if (distance <= 38) return { score: 20, label: "armonía tonal" };
  if (distance >= 145 && distance <= 215) return { score: 18, label: "contraste complementario" };
  if (distance <= 78) return { score: 15, label: "paleta análoga" };
  return { score: 9, label: "contraste controlado" };
}

function metadata(item) {
  return {
    ...item,
    season: item.season || "all",
    material: item.material || "mixed",
    silhouette: item.silhouette || "regular",
    weight: item.weight || "medium",
    occasions: item.occasions?.length ? item.occasions : ["casual", "weekend"],
    climates: item.climates?.length ? item.climates : ["mild"],
  };
}

function buildSuggestions(sourceItems, filters, count) {
  const items = sourceItems.map(metadata);
  const byPart = Object.fromEntries(PARTS.map(([part]) => [part, items.filter((item) => item.part === part)]));
  if (!byPart.upperbody.length || !byPart.lowerbody.length) return [];
  const candidates = [];
  const outers = [null, ...byPart.wholebody_up];
  const shoes = [null, ...byPart.shoes];
  const accessories = [null, ...byPart.accessories_up];

  for (const top of byPart.upperbody) {
    for (const bottom of byPart.lowerbody) {
      for (const outer of outers) {
        const outfitItems = [top, bottom, outer].filter(Boolean);
        const seasonMatches = outfitItems.every((item) => item.season === "all" || item.season === filters.season);
        if (filters.season !== "all" && !seasonMatches) continue;
        const selectedShoe = shoes.length > 1 ? shoes[(candidates.length % (shoes.length - 1)) + 1] : null;
        const selectedAccessory = accessories.length > 1 && candidates.length % 3 === 0 ? accessories[(candidates.length % (accessories.length - 1)) + 1] : null;
        const selected = [...outfitItems, selectedShoe, selectedAccessory].filter(Boolean);
        const color = colorCompatibility(top.color, bottom.color);
        const silhouetteBalanced = ["oversized", "flowy", "relaxed"].includes(top.silhouette)
          ? ["fitted", "regular", "structured"].includes(bottom.silhouette)
          : true;
        const layersPossible = !outer || (WEIGHT[outer.weight] || 2) >= (WEIGHT[top.weight] || 2);
        if (!layersPossible) continue;
        const occasionMatches = selected.filter((item) => item.occasions.includes(filters.occasion)).length;
        const climateMatches = selected.filter((item) => item.climates.includes(filters.climate)).length;
        const materialScore = top.material === bottom.material ? 7 : 11;
        const score = Math.min(98, 38 + color.score + materialScore + (silhouetteBalanced ? 12 : 5) + (occasionMatches * 4) + (climateMatches * 3) + (outer ? 2 : 0));
        const key = selected.map((item) => item.id).sort().join("|");
        const reasons = [
          color.label,
          silhouetteBalanced ? "siluetas equilibradas" : "volumen expresivo",
          materialScore > 8 ? "materiales compatibles" : "textura continua",
          outer ? "capas físicamente posibles" : "construcción limpia",
        ];
        candidates.push({
          id: `suggested-${key.replaceAll("|", "-")}`,
          name: `${top.name || "Superior"} + ${bottom.name || "Inferior"}`,
          garmentIds: selected.map((item) => item.id),
          garments: selected,
          reason: `${reasons.slice(0, 3).join(", ")}. Pensado para ${FILTERS.occasions.find(([id]) => id === filters.occasion)?.[1].toLowerCase()}.`,
          score,
          occasion: filters.occasion,
          season: filters.season,
          climate: filters.climate,
          source: "suggested",
          status: "planned",
          combinationKey: key,
        });
      }
    }
  }

  const usage = new Map();
  const chosen = [];
  const remaining = [...candidates];
  while (remaining.length && chosen.length < count) {
    remaining.sort((a, b) => {
      const penaltyA = a.garmentIds.reduce((total, id) => total + (usage.get(id) || 0), 0) * 4;
      const penaltyB = b.garmentIds.reduce((total, id) => total + (usage.get(id) || 0), 0) * 4;
      return (b.score - penaltyB) - (a.score - penaltyA);
    });
    const candidate = remaining.shift();
    const repetition = candidate.garmentIds.reduce((total, id) => total + (usage.get(id) || 0), 0);
    candidate.score = Math.max(65, candidate.score - repetition * 4);
    chosen.push(candidate);
    candidate.garmentIds.forEach((id) => usage.set(id, (usage.get(id) || 0) + 1));
  }
  return chosen;
}

function GarmentMini({ item }) {
  return (
    <div className="garment-mini" title={item.name}>
      <img src={item.thumbnail || item.image} alt="" />
      <span>{item.name}</span>
    </div>
  );
}

function OutfitCard({ outfit, onGenerate, onSave, busy, saved }) {
  return (
    <article className="tryon-look-card">
      <div className="tryon-look-visual">
        {outfit.image
          ? <img className="generated-look" src={outfit.image} alt={`Prueba virtual de ${outfit.name}`} />
          : <div className="garment-composition">{outfit.garments.map((item) => <GarmentMini item={item} key={item.id} />)}</div>}
        <div className="match-score">{outfit.score}%</div>
        <button className={`look-heart${saved ? " active" : ""}`} type="button" onClick={() => onSave(outfit)} aria-label="Guardar look"><Heart size={16} weight={saved ? "fill" : "regular"} /></button>
      </div>
      <div className="tryon-look-copy">
        <div><p>{outfit.occasion} · {outfit.climate}</p><h3>{outfit.name}</h3></div>
        <button className="wd-try" type="button" disabled={busy} onClick={() => onGenerate(outfit)}>
          {busy ? <SpinnerGap className="spin" size={14} /> : null} {outfit.image ? "Regenerar prueba" : "Probar este look"}
        </button>
      </div>
    </article>
  );
}

const WARDROBE_TABS = [
  ["all", "All"],
  ["upperbody", "Tops"],
  ["wholebody_up", "Jackets"],
  ["lowerbody", "Bottoms"],
  ["accessories_up", "Accessories"],
  ["shoes", "Shoes"],
];
const PART_ORDER = Object.fromEntries(WARDROBE_TABS.slice(1).map(([part], index) => [part, index]));

// real: true → la foto se usa como referencia de identidad en las pruebas
// virtuales. Los placeholders (real: false) se reemplazan por fotos IA con
// `pnpm run generate-models` cuando hay cuota de imagen.
const MODEL_PRESETS = [
  { id: "blanca", gender: "mujer", label: "Blanca", image: "/fashion/models/modelo-blanca.png", skinTone: "clara", real: true },
  { id: "canela", gender: "mujer", label: "Canela", image: "/fashion/models/modelo-canela.png", skinTone: "media", real: true },
  { id: "negra", gender: "mujer", label: "Negra", image: "/fashion/models/modelo-negra.png", skinTone: "oscura", real: false },
  { id: "h-blanco", gender: "hombre", label: "Blanco", image: "/fashion/models/modelo-h-blanca.png", skinTone: "clara", real: false },
  { id: "h-canela", gender: "hombre", label: "Canela", image: "/fashion/models/modelo-h-canela.png", skinTone: "media", real: false },
  { id: "h-negro", gender: "hombre", label: "Negro", image: "/fashion/models/modelo-h-negra.png", skinTone: "oscura", real: false },
];
const BUILD_OPTIONS = [["media", "Normal"], ["atletica", "Atlética"]];
const GENDER_OPTIONS = [["mujer", "Mujer"], ["hombre", "Hombre"]];

function fitsGender(item, gender) {
  return !item.gender || item.gender === "unisex" || item.gender === gender;
}

async function urlToDataUrl(url) {
  const blob = await fetch(url).then((response) => response.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

export function VirtualTryOn({ items, onAddProducts, onOpenItem, onModelUpdate }) {
  const [section, setSection] = useState("all");
  const [filters, setFilters] = useState({ season: "autumn", occasion: "casual", climate: "mild" });
  const [count, setCount] = useState(6);
  const [suggestions, setSuggestions] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [builder, setBuilder] = useState({});
  const [config, setConfig] = useState({ hasApiKey: false, hasModelReference: false, provider: "gemini", profile: null });
  const [modelDraft, setModelDraft] = useState({ gender: "mujer", preset: MODEL_PRESETS[0].id, complexion: "media", ownPhoto: false });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const faceInput = useRef(null);
  const normalizedItems = useMemo(() => items.map(metadata), [items]);
  const activeGender = config.profile?.gender === "hombre" ? "hombre" : "mujer";
  const genderItems = useMemo(() => normalizedItems.filter((item) => fitsGender(item, activeGender)), [normalizedItems, activeGender]);

  const activeModelImage = useMemo(() => {
    if (!config.profile) return null;
    const preset = MODEL_PRESETS.find((entry) => entry.id === config.profile.preset);
    return preset?.image || (config.hasModelReference ? config.modelReferenceUrl || "/api/tryon/model-reference" : null);
  }, [config]);

  useEffect(() => {
    if (onModelUpdate) onModelUpdate(activeModelImage);
  }, [activeModelImage, onModelUpdate]);

  useEffect(() => {
    Promise.all([
      request("/api/tryon/config"),
      request("/api/tryon/outfits"),
    ]).then(([setup, collection]) => {
      setConfig(setup);
      setSavedOutfits(collection.outfits || []);
      if (setup.profile) {
        setModelDraft({
          gender: setup.profile.gender === "hombre" ? "hombre" : "mujer",
          preset: setup.profile.preset || MODEL_PRESETS[0].id,
          complexion: setup.profile.complexion === "atletica" ? "atletica" : "media",
          ownPhoto: !setup.profile.preset && setup.profile.mode === "photo",
        });
      } else {
        setSection("profile");
      }
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    setSuggestions(buildSuggestions(genderItems, filters, count));
  }, [genderItems, filters, count]);

  const uploadFace = async (file) => {
    if (!file) return;
    setError(""); setNotice("Preparando tu referencia…");
    try {
      const imageDataUrl = await fileToDataUrl(file);
      const result = await request("/api/tryon/model-reference", { method: "POST", body: JSON.stringify({ imageDataUrl }) });
      setConfig((current) => ({ ...current, hasModelReference: true, modelReferenceUrl: result.modelReferenceUrl }));
      setNotice("Referencia guardada de forma local.");
    } catch (uploadError) { setError(uploadError.message); setNotice(""); }
  };

  const saveProfile = async () => {
    if (modelDraft.ownPhoto && !config.hasModelReference) {
      setError("Subí tu foto para usar este modo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const genderPresets = MODEL_PRESETS.filter((entry) => entry.gender === modelDraft.gender);
      const preset = modelDraft.ownPhoto ? null : genderPresets.find((entry) => entry.id === modelDraft.preset) || genderPresets[0];
      if (preset?.real) {
        // la modelo elegida pasa a ser la referencia de identidad para las pruebas virtuales
        const imageDataUrl = await urlToDataUrl(preset.image);
        await request("/api/tryon/model-reference", { method: "POST", body: JSON.stringify({ imageDataUrl }) });
      }
      const saved = await request("/api/tryon/model-profile", {
        method: "POST",
        body: JSON.stringify({
          // los presets sin foto real generan con modelo descripto (género + tez + complexión)
          mode: preset && !preset.real ? "default" : "photo",
          gender: modelDraft.gender,
          complexion: modelDraft.complexion,
          skinTone: preset?.skinTone || null,
          preset: preset?.id || null,
        }),
      });
      setConfig((current) => ({ ...current, profile: saved, hasModelReference: true }));
      setNotice("Modelo guardado. Estas son las prendas de la temporada.");
      setSection("all");
    } catch (profileError) { setError(profileError.message); }
    finally { setSaving(false); }
  };

  const saveOutfit = async (outfit) => {
    try {
      const saved = await request("/api/tryon/outfits", { method: "POST", body: JSON.stringify(outfit) });
      setSavedOutfits((current) => [...current.filter((item) => item.id !== saved.id && [...item.garmentIds].sort().join("|") !== [...saved.garmentIds].sort().join("|")), saved]);
      setNotice("Look guardado.");
    } catch (saveError) { setError(saveError.message); }
  };

  const generate = async (outfit) => {
    if (!config.profile) { setSection("profile"); setError("Elegí primero tu modelo: predeterminado o con tu foto."); return; }
    if (config.profile.mode !== "default" && !config.hasModelReference) { setSection("profile"); setError("Subí una foto de referencia antes de generar la prueba virtual."); return; }
    if (!config.hasApiKey) { setError(`Configurá ${config.provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} en .env para generar la imagen final.`); return; }
    setBusyId(outfit.id); setError(""); setNotice("Generando una prueba virtual fiel a las prendas…");
    try {
      const generated = await request("/api/tryon/generate", { method: "POST", body: JSON.stringify(outfit) });
      const complete = { ...generated, garments: generated.garmentIds.map((id) => normalizedItems.find((item) => item.id === id)).filter(Boolean) };
      setSuggestions((current) => current.map((item) => item.combinationKey === outfit.combinationKey ? { ...item, ...complete } : item));
      setSavedOutfits((current) => [...current.filter((item) => item.id !== generated.id), generated]);
      setNotice("Tu prueba virtual está lista.");
    } catch (generationError) { setError(generationError.message); setNotice(""); }
    finally { setBusyId(null); }
  };

  const manualGarments = PARTS.map(([part]) => normalizedItems.find((item) => item.id === builder[part])).filter(Boolean);
  const manualReady = Boolean(builder.upperbody && builder.lowerbody);
  const manualOutfit = manualReady ? {
    id: `manual-${manualGarments.map((item) => item.id).join("-")}`,
    name: "Mi combinación",
    garmentIds: manualGarments.map((item) => item.id),
    garments: manualGarments,
    reason: "Combinación creada libremente con prendas del catálogo seleccionado.",
    score: 100,
    ...filters,
    source: "manual",
    status: "planned",
    combinationKey: manualGarments.map((item) => item.id).sort().join("|"),
  } : null;

  const savedKeys = new Set(savedOutfits.map((outfit) => [...outfit.garmentIds].sort().join("|")));
  const inOutfits = ["outfits", "builder", "profile"].includes(section);
  const gridItems = useMemo(() => {
    const filtered = section === "all" ? genderItems : genderItems.filter((item) => item.part === section);
    return [...filtered].sort((a, b) => {
      if (section === "all") {
        const difference = (PART_ORDER[a.part] ?? 99) - (PART_ORDER[b.part] ?? 99);
        if (difference) return difference;
      }
      return a.id.localeCompare(b.id);
    });
  }, [genderItems, section]);

  return (
    <main className="tryon-shell wd-shell">
      {section !== "profile" && (
        <>
          <header className="wd-topline">
            <p className="wd-count">{inOutfits ? `${suggestions.length} outfits` : `${gridItems.length} pieces`}</p>
            <div className="wd-topline-actions">
              <button className="wd-model-chip" type="button" onClick={() => setSection("profile")} aria-label="Cambiar modelo">
                {activeModelImage && <img src={activeModelImage} alt="" />}
                <span>Mi modelo</span>
              </button>
              <button className="wd-quiet" type="button" onClick={onAddProducts}>Administrar catálogo</button>
            </div>
          </header>

          <nav className="wd-tabs" aria-label="Categorías del vestidor">
            {WARDROBE_TABS.map(([id, label]) => (
              <button key={id} className={section === id ? "active" : ""} type="button" onClick={() => setSection(id)}>{label}</button>
            ))}
            <button className={inOutfits ? "active" : ""} type="button" onClick={() => setSection("outfits")}>Outfits</button>
          </nav>
        </>
      )}

      {(notice || error) && <div className={`tryon-notice${error ? " error" : ""}`} role="status">{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

      {!inOutfits && (gridItems.length ? (
        <div className="wd-grid">
          {gridItems.map((item) => (
            <button
              key={item.id}
              className="wd-piece"
              type="button"
              onClick={() => onOpenItem(item.id)}
              aria-label={item.name || "Prenda"}
              data-testid={`wardrobe-item-${item.id}`}
            >
              <OptimizedImage
                src={item.thumbnail || item.image}
                alt=""
                sizes="(max-width: 640px) 45vw, 220px"
                breakpoints={[160, 240, 320, 480]}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="wd-empty">
          <p>No hay piezas en esta categoría todavía.</p>
          <button type="button" onClick={onAddProducts}>Cargar productos</button>
        </div>
      ))}

      {section === "outfits" && (
        <section className="wd-outfits">
          <div className="wd-outfit-tools">
            <div className="wd-filters">
              <label><span>Temporada</span><select value={filters.season} onChange={(event) => setFilters({ ...filters, season: event.target.value })}>{FILTERS.seasons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label><span>Ocasión</span><select value={filters.occasion} onChange={(event) => setFilters({ ...filters, occasion: event.target.value })}>{FILTERS.occasions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label><span>Clima</span><select value={filters.climate} onChange={(event) => setFilters({ ...filters, climate: event.target.value })}>{FILTERS.climates.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label><span>Cantidad</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 6, 9, 12].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            <div className="wd-links">
              <button type="button" onClick={() => setSection("builder")}>Crear un look</button>
            </div>
          </div>
          {suggestions.length ? (
            <div className="tryon-look-grid">
              {suggestions.map((outfit) => <OutfitCard key={outfit.id} outfit={outfit} onGenerate={generate} onSave={saveOutfit} busy={busyId === outfit.id} saved={savedKeys.has(outfit.combinationKey)} />)}
            </div>
          ) : (
            <div className="wd-empty">
              <p>El catálogo de la temporada está vacío. Cargá productos para activar las combinaciones.</p>
              <button type="button" onClick={onAddProducts}>Cargar el catálogo</button>
            </div>
          )}
        </section>
      )}

      {section === "builder" && (
        <section className="tryon-section builder-section">
          <button className="wd-back" type="button" onClick={() => setSection("outfits")}>← Outfits</button>
          <div className="tryon-section-heading"><div><p>Combinación libre</p><h2>Creá tu propio look</h2></div><p>Elegí una prenda de cada categoría. La parte superior y la inferior son obligatorias; el resto es opcional.</p></div>
          <div className="builder-layout">
            <div className="builder-selectors">
              {PARTS.map(([part, label]) => (
                <fieldset key={part}>
                  <legend>{label} <small>{["upperbody", "lowerbody"].includes(part) ? "obligatorio" : "opcional"}</small></legend>
                  <div className="builder-options">
                    {!["upperbody", "lowerbody"].includes(part) && <button className={!builder[part] ? "active empty-option" : "empty-option"} type="button" onClick={() => setBuilder({ ...builder, [part]: null })}>Sin {label.toLowerCase()}</button>}
                    {genderItems.filter((item) => item.part === part).map((item) => <button className={builder[part] === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setBuilder({ ...builder, [part]: item.id })}><img src={item.thumbnail || item.image} alt="" /><span>{item.name}</span></button>)}
                  </div>
                </fieldset>
              ))}
            </div>
            <aside className="builder-preview">
              <p>Tu selección</p>
              <h3>{manualReady ? "Look listo para probar" : "Elegí al menos dos prendas"}</h3>
              <div className="builder-preview-stage">
                {manualGarments.length ? manualGarments.map((item) => <GarmentMini item={item} key={item.id} />) : <MagicWand size={34} />}
              </div>
              <ul>{manualGarments.map((item) => <li key={item.id}><i style={{ background: item.color }} />{item.name}<span>{PARTS.find(([part]) => part === item.part)?.[1]}</span></li>)}</ul>
              <button className="tryon-primary" type="button" disabled={!manualReady || busyId === manualOutfit?.id} onClick={() => generate(manualOutfit)}>{busyId === manualOutfit?.id ? <SpinnerGap className="spin" /> : <MagicWand />} Generar prueba virtual</button>
              <button className="tryon-secondary" type="button" disabled={!manualReady} onClick={() => saveOutfit(manualOutfit)}><Heart size={16} /> Guardar combinación</button>
            </aside>
          </div>
        </section>
      )}

      {section === "profile" && (
        <section className="wd-model-select">
          {config.profile && <button className="wd-back" type="button" onClick={() => setSection("all")}>← Volver a las prendas</button>}
          <header className="wd-model-heading">
            <p>Antes de empezar</p>
            <h2>Elegí tu modelo</h2>
            <span>El catálogo y las pruebas virtuales se adaptan al género y al modelo que elijas.</span>
          </header>

          <div className="wd-model-build wd-model-gender">
            <span>Catálogo</span>
            {GENDER_OPTIONS.map(([id, label]) => (
              <button
                key={id}
                className={modelDraft.gender === id ? "active" : ""}
                type="button"
                onClick={() => {
                  const first = MODEL_PRESETS.find((entry) => entry.gender === id);
                  setModelDraft({ ...modelDraft, gender: id, preset: first?.id, ownPhoto: false });
                }}
              >{label}</button>
            ))}
          </div>

          <div className="wd-model-cards">
            {MODEL_PRESETS.filter((preset) => preset.gender === modelDraft.gender).map((preset) => (
              <button
                key={preset.id}
                className={`wd-model-card${!modelDraft.ownPhoto && modelDraft.preset === preset.id ? " active" : ""}`}
                type="button"
                onClick={() => setModelDraft({ ...modelDraft, preset: preset.id, ownPhoto: false })}
              >
                <img src={preset.image} alt={`Modelo de ${preset.label.toLowerCase()}`} />
                <span>{preset.label}</span>
              </button>
            ))}
            <button
              className={`wd-model-card wd-model-own${modelDraft.ownPhoto ? " active" : ""}`}
              type="button"
              onClick={() => setModelDraft({ ...modelDraft, ownPhoto: true })}
            >
              {modelDraft.ownPhoto && config.hasModelReference
                ? <img src={config.modelReferenceUrl || "/api/tryon/model-reference"} alt="Tu foto de referencia" />
                : <span className="wd-model-own-hint">Subí una foto de cuerpo entero, frontal y con buena luz.</span>}
              <span>Usar mi foto</span>
            </button>
          </div>

          {modelDraft.ownPhoto && (
            <div className="wd-model-upload">
              <input ref={faceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { uploadFace(event.target.files?.[0]); event.target.value = ""; }} />
              <button type="button" onClick={() => faceInput.current?.click()}>{config.hasModelReference ? "Cambiar mi foto" : "Subir mi foto"}</button>
            </div>
          )}

          <div className="wd-model-build">
            <span>Complexión</span>
            {BUILD_OPTIONS.map(([id, label]) => (
              <button key={id} className={modelDraft.complexion === id ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, complexion: id })}>{label}</button>
            ))}
          </div>

          <button className="wd-model-save" type="button" disabled={saving} onClick={saveProfile}>
            {saving ? "Guardando…" : "Guardar y ver las prendas"}
          </button>
        </section>
      )}

      {!!savedOutfits.filter((item) => item.image).length && section === "outfits" && (
        <section className="saved-looks">
          <div><p>Tus pruebas</p><h2>Looks generados</h2></div>
          <div>{savedOutfits.filter((item) => item.image).map((outfit) => <figure key={outfit.id}><img src={outfit.image} alt={outfit.name} /><figcaption>{outfit.name}</figcaption></figure>)}</div>
        </section>
      )}
    </main>
  );
}
