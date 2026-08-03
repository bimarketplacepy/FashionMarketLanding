import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Heart, PencilSimple, SpinnerGap } from "@phosphor-icons/react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { draftFromOutfit, writeDraft } from "./outfit-draft.js";
import { avatarDataUrl, DEFAULT_PERFIL, HAIR_STOPS, MONK_TONES, normalizeAvatarPerfil, peloHexFromValor, tonoHexFromValor } from "./model-avatar.js";
import { garmentFitsModel, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";
import "./virtual-tryon.css";

export const PARTS = [
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

// Customizador "Creá tu modelo": la complexión se comunica solo con forma
// (iconos), y piel/pelo solo con color (sliders de gradiente). Ninguna palabra
// descriptiva de características físicas aparece en la UI; los aria-labels son
// neutros. La silueta la define el toggle de catálogo (mujer/hombre).
const complexionIcon = (level) => {
  const half = [6.5, 9, 12][level - 1];
  return (
    <svg viewBox="0 0 40 48" aria-hidden="true" focusable="false">
      <circle cx="20" cy="7.5" r="5" />
      <rect x={20 - half} y="16" width={half * 2} height="29" rx={half * 0.75} />
    </svg>
  );
};

const TONO_GRADIENT = `linear-gradient(90deg, ${MONK_TONES.join(", ")})`;
const PELO_GRADIENT = `linear-gradient(90deg, ${HAIR_STOPS.join(", ")})`;

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

export function colorCompatibility(first, second) {
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

export function metadata(item) {
  return {
    ...item,
    garmentType: normalizeGarmentType(item.garmentType, item.part),
    gender: inferGarmentGender(item),
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

function OutfitCard({ outfit, onGenerate, onSave, onEdit, busy, saved }) {
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
        <button className="wd-try wd-try-edit" type="button" onClick={() => onEdit(outfit)}>
          <PencilSimple size={14} /> Editar en el builder
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

const BUILD_OPTIONS = [["media", "Normal"], ["atletica", "Atlética"]];
const GENDER_OPTIONS = [["mujer", "Mujer"], ["hombre", "Hombre"]];

// El toggle de catálogo (mujer/hombre) también define la silueta del
// customizador "Creá tu modelo".
const GENDER_SILUETA = { mujer: "B", hombre: "A" };

function fitsGender(item, gender) {
  return garmentFitsModel(item, gender);
}

export function VirtualTryOn({ items, onAddProducts, onOpenItem, onModelUpdate, initialSection }) {
  const [, navigate] = useLocation();
  const [section, setSection] = useState(initialSection || "all");
  const [filters, setFilters] = useState({ season: "autumn", occasion: "casual", climate: "mild" });
  const [count, setCount] = useState(6);
  const [suggestions, setSuggestions] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [config, setConfig] = useState({ hasApiKey: false, hasModelReference: false, provider: "gemini", profile: null });
  const [modelDraft, setModelDraft] = useState({ gender: "mujer", complexion: "media", ownPhoto: false, custom: true });
  const [customDraft, setCustomDraft] = useState(DEFAULT_PERFIL);
  const [customModel, setCustomModel] = useState(null); // { url, verified, cached } del modelo IA generado
  const [generating, setGenerating] = useState(false);
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
    return config.profile.modelUrl || (config.hasModelReference ? config.modelReferenceUrl || "/api/tryon/model-reference" : null);
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
        const gender = setup.profile.gender === "hombre" ? "hombre" : "mujer";
        const custom = Boolean(setup.profile.custom);
        setModelDraft({
          gender,
          complexion: setup.profile.complexion === "atletica" ? "atletica" : "media",
          ownPhoto: !custom && setup.profile.mode === "photo" && !setup.profile.preset,
          custom: custom || setup.profile.mode !== "photo" || Boolean(setup.profile.preset),
        });
        if (custom) {
          setCustomDraft(normalizeAvatarPerfil(setup.profile.custom));
          if (setup.profile.modelUrl) setCustomModel({ url: setup.profile.modelUrl, verified: true, cached: true });
        } else {
          setCustomDraft((current) => ({ ...current, silueta: GENDER_SILUETA[gender] }));
        }
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

  // Cambiar cualquier variable del customizador invalida la foto ya generada.
  const updateCustom = (patch) => {
    setCustomDraft((current) => ({ ...current, ...patch }));
    setCustomModel(null);
  };

  // Al confirmar la selección del customizador se genera la foto del modelo con
  // el prompt maestro (el servidor sirve de caché si esa combinación ya existe)
  // y pasa a ser la referencia de identidad del probador.
  const generateCustomModel = async (force = false) => {
    setGenerating(true); setError(""); setNotice("Generando tu modelo con IA… puede tardar un minuto.");
    try {
      const result = await request("/api/tryon/generate-model", { method: "POST", body: JSON.stringify({ ...customDraft, setAsReference: true, force }) });
      setCustomModel({ ...result, url: result.cached ? result.url : `${result.url}?v=${Date.now()}` });
      setConfig((current) => ({ ...current, hasModelReference: true, modelReferenceUrl: `/api/tryon/model-reference?updated=${Date.now()}` }));
      setNotice(result.verified
        ? (result.cached ? "Tu modelo ya estaba generado: listo al instante." : "Tu modelo está listo. Guardalo para vestirlo con el catálogo.")
        : "Modelo generado, pero la validación automática detectó posibles defectos (cuerpo cortado o manos). Podés ajustar y regenerar.");
    } catch (generateError) { setError(generateError.message); setNotice(""); }
    finally { setGenerating(false); }
  };

  const saveProfile = async () => {
    if (modelDraft.ownPhoto && !config.hasModelReference) {
      setError("Subí tu foto para usar este modo.");
      return;
    }
    if (modelDraft.custom && !customModel) {
      setError("Generá tu modelo con IA antes de guardarlo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (modelDraft.custom) {
        const saved = await request("/api/tryon/model-profile", {
          method: "POST",
          body: JSON.stringify({
            mode: "photo", // el modelo generado es la referencia de identidad
            gender: customDraft.silueta === "A" ? "hombre" : "mujer",
            complexion: customDraft.complexion,
            skinTone: null,
            preset: null,
            custom: customDraft,
          }),
        });
        setConfig((current) => ({ ...current, profile: saved, hasModelReference: true }));
        setNotice("Modelo guardado. Estas son las prendas de la temporada.");
        setSection("all");
        return;
      }
      // Modo "usar mi foto": la foto subida es la referencia de identidad.
      const saved = await request("/api/tryon/model-profile", {
        method: "POST",
        body: JSON.stringify({
          mode: "photo",
          gender: modelDraft.gender,
          complexion: modelDraft.complexion,
          skinTone: null,
          preset: null,
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

  const editInBuilder = (outfit) => {
    writeDraft(draftFromOutfit(outfit, normalizedItems));
    navigate("/outfit");
  };

  const compatibleIds = new Set(genderItems.map((item) => item.id));
  const compatibleSavedOutfits = savedOutfits.filter((outfit) => outfit.garmentIds.every((id) => compatibleIds.has(id)));
  const savedKeys = new Set(compatibleSavedOutfits.map((outfit) => [...outfit.garmentIds].sort().join("|")));
  const inOutfits = ["outfits", "profile"].includes(section);
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
              {onAddProducts && <button className="wd-quiet" type="button" onClick={onAddProducts}>Administrar catálogo</button>}
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
              <span className="wd-piece-caption">
                <span>{item.name}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="wd-empty">
          <p>No hay piezas en esta categoría todavía.</p>
          {onAddProducts && <button type="button" onClick={onAddProducts}>Cargar productos</button>}
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
              <button type="button" onClick={() => navigate("/outfit")}>Armá tu outfit</button>
            </div>
          </div>
          {suggestions.length ? (
            <div className="tryon-look-grid">
              {suggestions.map((outfit) => <OutfitCard key={outfit.id} outfit={outfit} onGenerate={generate} onSave={saveOutfit} onEdit={editInBuilder} busy={busyId === outfit.id} saved={savedKeys.has(outfit.combinationKey)} />)}
            </div>
          ) : (
            <div className="wd-empty">
              <p>El catálogo de la temporada está vacío. Cargá productos para activar las combinaciones.</p>
              {onAddProducts && <button type="button" onClick={onAddProducts}>Cargar el catálogo</button>}
            </div>
          )}
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
                  // El catálogo define el género y, con él, la silueta del
                  // customizador "Creá tu modelo".
                  setModelDraft({ ...modelDraft, gender: id });
                  if (customDraft.silueta !== GENDER_SILUETA[id]) updateCustom({ silueta: GENDER_SILUETA[id] });
                }}
              >{label}</button>
            ))}
          </div>

          <div className="wd-model-cards">
            <button
              className={`wd-model-card wd-model-custom${modelDraft.custom ? " active" : ""}`}
              type="button"
              onClick={() => setModelDraft({ ...modelDraft, ownPhoto: false, custom: true })}
            >
              <img src={customModel?.url || avatarDataUrl(customDraft)} alt="Vista previa de tu modelo personalizado" />
              <span>Creá tu modelo</span>
            </button>
            <button
              className={`wd-model-card wd-model-own${modelDraft.ownPhoto ? " active" : ""}`}
              type="button"
              onClick={() => setModelDraft({ ...modelDraft, ownPhoto: true, custom: false })}
            >
              {modelDraft.ownPhoto && config.hasModelReference
                ? <img src={config.modelReferenceUrl || "/api/tryon/model-reference"} alt="Tu foto de referencia" />
                : <span className="wd-model-own-hint">Subí una foto de cuerpo entero, frontal y con buena luz.</span>}
              <span>Usar mi foto</span>
            </button>
          </div>

          {modelDraft.custom && (
            <div className="wd-custom-panel">
              <header className="wd-custom-heading">
                <h3>Creá tu modelo</h3>
                <p>Elegí el modelo que mejor te represente</p>
              </header>
              <div className="wd-custom-body">
                <figure className="wd-custom-preview">
                  <img src={customModel?.url || avatarDataUrl(customDraft)} alt="Vista previa de tu modelo" />
                </figure>
                <div className="wd-custom-controls">
                  <div className="wd-icon-row" role="group" aria-label="Complexión">
                    {[1, 2, 3].map((level) => (
                      <button
                        key={level}
                        className={`wd-icon-btn${customDraft.complexion === level ? " active" : ""}`}
                        type="button"
                        aria-label={`Complexión ${level}`}
                        aria-pressed={customDraft.complexion === level}
                        onClick={() => updateCustom({ complexion: level })}
                      >{complexionIcon(level)}</button>
                    ))}
                  </div>
                  <input
                    className="wd-slider"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={customDraft.tonoValor}
                    style={{ background: TONO_GRADIENT }}
                    aria-label="Tono de piel"
                    onChange={(event) => { const valor = Number(event.target.value); updateCustom({ tonoValor: valor, tonoHex: tonoHexFromValor(valor) }); }}
                  />
                  <input
                    className="wd-slider"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={customDraft.peloValor}
                    style={{ background: PELO_GRADIENT }}
                    aria-label="Color de pelo"
                    onChange={(event) => { const valor = Number(event.target.value); updateCustom({ peloValor: valor, peloHex: peloHexFromValor(valor) }); }}
                  />
                  <button className="wd-model-save wd-custom-generate" type="button" disabled={generating} aria-busy={generating} onClick={() => generateCustomModel(Boolean(customModel))}>
                    {generating ? <SpinnerGap className="spin" size={16} aria-label="Creando tu modelo" /> : "Crear mi modelo"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {modelDraft.ownPhoto && (
            <div className="wd-model-upload">
              <input ref={faceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { uploadFace(event.target.files?.[0]); event.target.value = ""; }} />
              <button type="button" onClick={() => faceInput.current?.click()}>{config.hasModelReference ? "Cambiar mi foto" : "Subir mi foto"}</button>
            </div>
          )}

          {!modelDraft.custom && (
            <div className="wd-model-build">
              <span>Complexión</span>
              {BUILD_OPTIONS.map(([id, label]) => (
                <button key={id} className={modelDraft.complexion === id ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, complexion: id })}>{label}</button>
              ))}
            </div>
          )}

          <button className="wd-model-save" type="button" disabled={saving} onClick={saveProfile}>
            {saving ? "Guardando…" : "Guardar y ver las prendas"}
          </button>
        </section>
      )}

      {!!compatibleSavedOutfits.filter((item) => item.image).length && section === "outfits" && (
        <section className="saved-looks">
          <div><p>Tus pruebas</p><h2>Looks generados</h2></div>
          <div>{compatibleSavedOutfits.filter((item) => item.image).map((outfit) => <figure key={outfit.id}><img src={outfit.image} alt={outfit.name} /><figcaption>{outfit.name}</figcaption></figure>)}</div>
        </section>
      )}
    </main>
  );
}
