import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Heart,
  MagicWand,
  Sparkle,
  SpinnerGap,
  UploadSimple,
  UserCircle,
} from "@phosphor-icons/react";
import { effectiveProfileGender, garmentFitsModel, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";
import "./virtual-tryon.css";

const PARTS = [
  ["upperbody", "Superior"],
  ["lowerbody", "Inferior"],
  ["wholebody", "Vestido / enterizo"],
  ["wholebody_up", "Abrigo"],
  ["shoes", "Calzado"],
  ["accessories_up", "Accesorio"],
];

const FILTERS = {
  seasons: [["all", "Todo el año"], ["spring", "Primavera"], ["summer", "Verano"], ["autumn", "Otoño"], ["winter", "Invierno"]],
  occasions: [["casual", "Casual"], ["office", "Oficina"], ["event", "Evento"], ["weekend", "Fin de semana"], ["smart-casual", "Smart casual"]],
  climates: [["warm", "Cálido"], ["mild", "Templado"], ["cold", "Frío"], ["rain", "Lluvia"]],
};

const OCCASION_LABELS = Object.fromEntries(FILTERS.occasions);
const CLIMATE_LABELS = Object.fromEntries(FILTERS.climates);

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

const GENDERS = [["mujer", "Mujer"], ["hombre", "Hombre"]];
const AGE_RANGES = [["18-25", "18–25"], ["26-35", "26–35"], ["36-50", "36–50"], ["51-65", "51–65"]];
const HEIGHTS = [["baja", "Baja"], ["media", "Media"], ["alta", "Alta"]];
const BODY_BALANCES = [["estrecha", "Hombros estrechos"], ["equilibrada", "Equilibrada"], ["amplia", "Hombros amplios"]];
const UNDERTONES = [["frio", "Frío"], ["neutro", "Neutro"], ["calido", "Cálido"]];
const HAIR_LENGTHS = [["rapado", "Rapado"], ["corto", "Corto"], ["medio", "Medio"], ["largo", "Largo"]];
const HAIR_COLORS = [["negro", "Negro"], ["castano-oscuro", "Castaño oscuro"], ["castano", "Castaño"], ["rubio", "Rubio"], ["pelirrojo", "Pelirrojo"], ["gris", "Gris / canoso"]];
const HAIR_TEXTURES = [["lacio", "Lacio"], ["ondulado", "Ondulado"], ["rizado", "Rizado"], ["afro", "Afro"], ["sin-cabello", "Sin cabello"]];

const DEFAULT_MODEL = {
  mode: "default",
  catalogGender: "mujer",
  modelGender: "mujer",
  complexion: "media",
  height: "media",
  bodyBalance: "equilibrada",
  ageRange: "26-35",
  skinTone: "media",
  undertone: "neutro",
  hairColor: "castano",
  hairLength: "medio",
  hairTexture: "ondulado",
};

const WEIGHT = { light: 1, medium: 2, heavy: 3 };
const NEUTRAL_SATURATION = 0.16;

function request(path, options) {
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  }).then(async (response) => {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(value.error || "No se pudo completar la acción."), {
        status: response.status,
        code: value.code || null,
        helpUrl: value.helpUrl || null,
      });
    }
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
    gender: inferGarmentGender(item),
    garmentType: normalizeGarmentType(item.garmentType, item.part),
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
  const hasTwoPieceBase = byPart.upperbody.length && byPart.lowerbody.length;
  if (!hasTwoPieceBase && !byPart.wholebody.length) return [];
  const candidates = [];
  const outers = [null, ...byPart.wholebody_up];
  const shoes = [null, ...byPart.shoes];
  const accessories = [null, ...byPart.accessories_up];

  const addBase = (baseItems, name) => {
    const [first, second] = baseItems;
    for (const outer of outers) {
      const outfitItems = [...baseItems, outer].filter(Boolean);
      const seasonMatches = outfitItems.every((item) => item.season === "all" || item.season === filters.season);
      if (filters.season !== "all" && !seasonMatches) continue;
      const selectedShoe = shoes.length > 1 ? shoes[(candidates.length % (shoes.length - 1)) + 1] : null;
      const selectedAccessory = accessories.length > 1 && candidates.length % 3 === 0 ? accessories[(candidates.length % (accessories.length - 1)) + 1] : null;
      const selected = [...outfitItems, selectedShoe, selectedAccessory].filter(Boolean);
      const color = second ? colorCompatibility(first.color, second.color) : { score: 18, label: "paleta protagonista" };
      const silhouetteBalanced = !second || !["oversized", "flowy", "relaxed"].includes(first.silhouette)
        || ["fitted", "regular", "structured"].includes(second.silhouette);
      const baseWeight = Math.max(...baseItems.map((item) => WEIGHT[item.weight] || 2));
      const layersPossible = !outer || (WEIGHT[outer.weight] || 2) >= baseWeight;
      if (!layersPossible) continue;
      const occasionMatches = selected.filter((item) => item.occasions.includes(filters.occasion)).length;
      const climateMatches = selected.filter((item) => item.climates.includes(filters.climate)).length;
      const materialScore = !second || first.material !== second.material ? 11 : 7;
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
        name,
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
  };

  if (hasTwoPieceBase) {
    for (const top of byPart.upperbody) {
      for (const bottom of byPart.lowerbody) addBase([top, bottom], `${top.name || "Superior"} + ${bottom.name || "Inferior"}`);
    }
  }
  for (const onePiece of byPart.wholebody) addBase([onePiece], onePiece.name || "Vestido / enterizo");

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
  const queued = outfit.status === "queued_chat";
  return (
    <article className="tryon-look-card">
      <div className="tryon-look-visual">
        {outfit.image
          ? <img className="generated-look" src={outfit.image} alt={`Prueba virtual de ${outfit.name}`} />
          : <div className="garment-composition">{outfit.garments.map((item) => <GarmentMini item={item} key={item.id} />)}</div>}
        <div className="match-score"><Sparkle size={12} weight="fill" /> {outfit.score}% compatible</div>
        <button className={`look-heart${saved ? " active" : ""}`} type="button" onClick={() => onSave(outfit)} aria-label="Guardá el look"><Heart size={18} weight={saved ? "fill" : "regular"} /></button>
      </div>
      <div className="tryon-look-copy">
        <div><p>{OCCASION_LABELS[outfit.occasion] || outfit.occasion} · {CLIMATE_LABELS[outfit.climate] || outfit.climate}</p><h3>{outfit.name}</h3></div>
        <p>{outfit.reason}</p>
        <div className="look-garment-pills">{outfit.garments.map((item) => <span key={item.id} style={{ "--swatch": item.color }}>{item.name}</span>)}</div>
        <button className="tryon-primary" type="button" disabled={busy || queued} onClick={() => onGenerate(outfit)}>
          {busy ? <SpinnerGap className="spin" size={17} /> : <MagicWand size={17} />} {queued ? "Procesando prueba" : (outfit.image ? "Generá otra versión" : "Probá este look")}
        </button>
      </div>
    </article>
  );
}

export function VirtualTryOn({ items, initialSection = "suggestions" }) {
  const [section, setSection] = useState(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  const [filters, setFilters] = useState({ season: "autumn", occasion: "casual", climate: "mild" });
  const [count, setCount] = useState(6);
  const [suggestions, setSuggestions] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [builder, setBuilder] = useState({});
  const [config, setConfig] = useState({ hasApiKey: false, hasModelReference: false, provider: "gemini", generationMode: "api", profile: null });
  const [modelDraft, setModelDraft] = useState(DEFAULT_MODEL);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const faceInput = useRef(null);
  const normalizedItems = useMemo(() => items.map(metadata), [items]);
  const modelGender = effectiveProfileGender(modelDraft);
  const genderItems = useMemo(() => normalizedItems.filter((item) => garmentFitsModel(item, modelGender)), [normalizedItems, modelGender]);

  useEffect(() => {
    Promise.all([
      request("/api/tryon/config"),
      request("/api/tryon/outfits"),
    ]).then(([setup, collection]) => {
      setConfig(setup);
      setSavedOutfits(collection.outfits || []);
      if (setup.profile) {
        setModelDraft({ ...DEFAULT_MODEL, ...setup.profile });
      } else {
        setSection("profile");
      }
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    const storedByCombination = new Map(savedOutfits.map((outfit) => [[...outfit.garmentIds].sort().join("|"), outfit]));
    setSuggestions(buildSuggestions(genderItems, filters, count).map((outfit) => {
      const stored = storedByCombination.get(outfit.combinationKey);
      return stored ? { ...outfit, ...stored, garments: outfit.garments, combinationKey: outfit.combinationKey } : outfit;
    }));
  }, [genderItems, filters, count, savedOutfits]);

  useEffect(() => {
    const allowedIds = new Set(genderItems.map((item) => item.id));
    setBuilder((current) => {
      let changed = false;
      const next = { ...current };
      for (const [part, id] of Object.entries(current)) {
        if (id && !allowedIds.has(id)) {
          next[part] = null;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [genderItems]);

  useEffect(() => {
    if (config.generationMode !== "chat") return undefined;
    const refresh = () => request("/api/tryon/outfits")
      .then((collection) => setSavedOutfits(collection.outfits || []))
      .catch(() => {});
    const interval = window.setInterval(refresh, 4000);
    return () => window.clearInterval(interval);
  }, [config.generationMode]);

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
    if (modelDraft.mode === "photo" && !config.hasModelReference) {
      setError("Subí tu foto para usar este modo.");
      return;
    }
    try {
      const profileToSave = modelDraft.mode === "default"
        ? { ...modelDraft, catalogGender: modelDraft.modelGender }
        : modelDraft;
      const saved = await request("/api/tryon/model-profile", { method: "POST", body: JSON.stringify(profileToSave) });
      setConfig((current) => ({ ...current, profile: saved }));
      setModelDraft((current) => ({ ...current, ...saved }));
      setError("");
      setNotice("Modelo guardado. Ya podés probar los looks de la temporada.");
      setSection("suggestions");
    } catch (profileError) {
      setError(profileError.message);
    }
  };

  const saveOutfit = async (outfit) => {
    try {
      const saved = await request("/api/tryon/outfits", { method: "POST", body: JSON.stringify(outfit) });
      setSavedOutfits((current) => [...current.filter((item) => item.id !== saved.id && [...item.garmentIds].sort().join("|") !== [...saved.garmentIds].sort().join("|")), saved]);
      setNotice("Look guardado.");
    } catch (saveError) { setError(saveError.message); }
  };

  const generate = async (outfit) => {
    const chatMode = config.generationMode === "chat";
    if (!config.profile) { setSection("profile"); setError("Elegí primero tu modelo: predeterminado o con tu foto."); return; }
    if (config.profile.mode !== "default" && !config.hasModelReference) { setSection("profile"); setError("Subí una foto de referencia antes de generar la prueba virtual."); return; }
    if (!chatMode && !config.hasApiKey) { setError("La generación de imágenes no está disponible en este momento. Intentá nuevamente más tarde."); return; }
    setBusyId(outfit.id); setError(""); setNotice("Estamos preparando tu prueba virtual…");
    try {
      const generated = await request("/api/tryon/generate", { method: "POST", body: JSON.stringify(outfit) });
      const complete = { ...generated, garments: generated.garmentIds.map((id) => normalizedItems.find((item) => item.id === id)).filter(Boolean) };
      setSuggestions((current) => current.map((item) => item.combinationKey === outfit.combinationKey ? { ...item, ...complete } : item));
      setSavedOutfits((current) => [...current.filter((item) => item.id !== generated.id), generated]);
      setNotice(generated.status === "queued_chat"
        ? "Tu prueba quedó en proceso. La imagen aparecerá acá cuando esté lista."
        : "Tu prueba virtual está lista.");
    } catch (generationError) {
      console.error("No se pudo generar la prueba virtual", generationError);
      setError(generationError.status === 400
        ? generationError.message
        : "No pudimos generar tu prueba. Intentá nuevamente en unos minutos.");
      setNotice("");
    }
    finally { setBusyId(null); }
  };

  const selectBuilderGarment = (part, id) => {
    setBuilder((current) => {
      if (part === "wholebody" && id) return { ...current, wholebody: id, upperbody: null, lowerbody: null };
      if (["upperbody", "lowerbody"].includes(part) && id) return { ...current, [part]: id, wholebody: null };
      return { ...current, [part]: id };
    });
  };
  const manualGarments = PARTS.map(([part]) => genderItems.find((item) => item.id === builder[part])).filter(Boolean);
  const manualReady = Boolean(builder.wholebody || (builder.upperbody && builder.lowerbody));
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

  const compatibleItemIds = new Set(genderItems.map((item) => item.id));
  const compatibleSavedOutfits = savedOutfits.filter((outfit) => outfit.garmentIds.every((id) => compatibleItemIds.has(id)));
  const savedKeys = new Set(compatibleSavedOutfits.map((outfit) => [...outfit.garmentIds].sort().join("|")));
  return (
    <main className="tryon-shell">
      <header className="tryon-header">
        <div>
          <p>Probador virtual</p>
          <h1>Un look para cada momento.</h1>
        </div>
      </header>

      <nav className="tryon-tabs" aria-label="Secciones del probador">
        {[["suggestions", "Looks sugeridos", Sparkle], ["builder", "Crear un look", MagicWand], ["profile", "Mi modelo", UserCircle]].map(([id, label, Icon]) => (
          <button key={id} className={section === id ? "active" : ""} type="button" onClick={() => setSection(id)}><Icon size={17} /> {label}</button>
        ))}
      </nav>

      {(notice || error) && (
        <div className={`tryon-notice${error ? " error" : ""}`} role="status">
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Cerrá el mensaje">×</button>
        </div>
      )}

      {section === "suggestions" && (
        <section className="tryon-section">
          <div className="tryon-section-heading">
            <div><p>Curaduría inteligente</p><h2>Combinaciones posibles</h2></div>
            <p>Evaluamos color, silueta, materiales, capas, ocasión, temporada y clima. Nunca mostramos dos combinaciones iguales.</p>
          </div>
          <div className="tryon-filterbar">
            <label><span>Temporada</span><select value={filters.season} onChange={(event) => setFilters({ ...filters, season: event.target.value })}>{FILTERS.seasons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><span>Ocasión</span><select value={filters.occasion} onChange={(event) => setFilters({ ...filters, occasion: event.target.value })}>{FILTERS.occasions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><span>Clima</span><select value={filters.climate} onChange={(event) => setFilters({ ...filters, climate: event.target.value })}>{FILTERS.climates.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><span>Cantidad</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 6, 9, 12].map((value) => <option key={value} value={value}>{value} looks</option>)}</select></label>
          </div>
          {suggestions.length ? (
            <div className="tryon-look-grid">
              {suggestions.map((outfit) => <OutfitCard key={outfit.id} outfit={outfit} onGenerate={generate} onSave={saveOutfit} busy={busyId === outfit.id} saved={savedKeys.has(outfit.combinationKey)} />)}
            </div>
          ) : (
            <div className="tryon-empty"><Sparkle size={30} /><h3>Próximamente vas a encontrar nuevos looks</h3><p>Estamos preparando las combinaciones de la próxima temporada.</p></div>
          )}
        </section>
      )}

      {section === "builder" && (
        <section className="tryon-section builder-section">
          <div className="tryon-section-heading"><div><p>Combinación libre</p><h2>Creá tu propio look</h2></div><p>Elegí un vestido o enterizo, o combiná una prenda superior con una inferior. El resto es opcional.</p></div>
          <div className="builder-layout">
            <div className="builder-selectors">
              {PARTS.map(([part, label]) => (
                <fieldset key={part}>
                  <legend>{label} <small>{part === "wholebody" ? "alternativa" : (["upperbody", "lowerbody"].includes(part) ? "obligatorio sin vestido" : "opcional")}</small></legend>
                  <div className="builder-options">
                    {!["upperbody", "lowerbody"].includes(part) && <button className={!builder[part] ? "active empty-option" : "empty-option"} type="button" onClick={() => selectBuilderGarment(part, null)}>Sin {label.toLowerCase()}</button>}
                    {genderItems.filter((item) => item.part === part).map((item) => <button className={builder[part] === item.id ? "active" : ""} key={item.id} type="button" onClick={() => selectBuilderGarment(part, item.id)}><img src={item.thumbnail || item.image} alt="" /><span>{item.name}</span></button>)}
                  </div>
                </fieldset>
              ))}
            </div>
            <aside className="builder-preview">
              <p>Tu selección</p>
              <h3>{manualReady ? "Look listo para probar" : "Elegí un vestido o dos prendas base"}</h3>
              <div className="builder-preview-stage">
                {manualGarments.length ? manualGarments.map((item) => <GarmentMini item={item} key={item.id} />) : <MagicWand size={34} />}
              </div>
              <ul>{manualGarments.map((item) => <li key={item.id}><i style={{ background: item.color }} />{item.name}<span>{PARTS.find(([part]) => part === item.part)?.[1]}</span></li>)}</ul>
              <button className="tryon-primary" type="button" disabled={!manualReady || busyId === manualOutfit?.id} onClick={() => generate(manualOutfit)}>{busyId === manualOutfit?.id ? <SpinnerGap className="spin" /> : <MagicWand />} Generá la prueba virtual</button>
              <button className="tryon-secondary" type="button" disabled={!manualReady} onClick={() => saveOutfit(manualOutfit)}><Heart size={16} /> Guardá la combinación</button>
            </aside>
          </div>
        </section>
      )}

      {section === "profile" && (
        <section className="tryon-section profile-section">
          <div className="profile-copy">
            <p>Tu modelo</p>
            <h2>Elegí quién luce los looks.</h2>
            <div className="model-mode-cards">
              <button className={modelDraft.mode === "default" ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, mode: "default" })}>
                <UserCircle size={22} /><strong>Modelo predeterminado</strong>
                <small>Un modelo profesional con la complexión y el tono de piel que elijas.</small>
              </button>
              <button className={modelDraft.mode === "photo" ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, mode: "photo" })}>
                <UploadSimple size={22} /><strong>Usá mi foto</strong>
                <small>Los looks conservan tu rostro y usan la complexión que elijas para el cuerpo generado.</small>
              </button>
            </div>
            {modelDraft.mode === "photo" ? (
              <fieldset className="model-fieldset">
                <legend>Prendas para</legend>
                <div className="model-options">
                  {GENDERS.map(([id, label]) => (
                    <button key={id} className={modelDraft.catalogGender === id ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, catalogGender: id })}>{label}</button>
                  ))}
                </div>
              </fieldset>
            ) : (
              <fieldset className="model-fieldset">
                <legend>Modelo humano</legend>
                <div className="model-options">
                  {GENDERS.map(([id, label]) => (
                    <button key={id} className={modelDraft.modelGender === id ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, modelGender: id, catalogGender: id })}>{label}</button>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="model-note">Las prendas específicas de mujer u hombre sólo aparecen para el modelo compatible. Las prendas unisex aparecen en ambos.</p>
            <fieldset className="model-fieldset">
              <legend>Complexión</legend>
              <div className="model-options">
                {COMPLEXIONS.map(([id, label]) => (
                  <button key={id} className={modelDraft.complexion === id ? "active" : ""} type="button" onClick={() => setModelDraft({ ...modelDraft, complexion: id })}>{label}</button>
                ))}
              </div>
            </fieldset>
            {modelDraft.mode === "default" && (
              <>
                <div className="model-detail-grid">
                  <label><span>Edad visual</span><select value={modelDraft.ageRange} onChange={(event) => setModelDraft({ ...modelDraft, ageRange: event.target.value })}>{AGE_RANGES.map(([id, label]) => <option key={id} value={id}>{label} años</option>)}</select></label>
                  <label><span>Altura</span><select value={modelDraft.height} onChange={(event) => setModelDraft({ ...modelDraft, height: event.target.value })}>{HEIGHTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Proporción corporal</span><select value={modelDraft.bodyBalance} onChange={(event) => setModelDraft({ ...modelDraft, bodyBalance: event.target.value })}>{BODY_BALANCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Subtono de piel</span><select value={modelDraft.undertone} onChange={(event) => setModelDraft({ ...modelDraft, undertone: event.target.value })}>{UNDERTONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Largo del cabello</span><select value={modelDraft.hairLength} onChange={(event) => setModelDraft({ ...modelDraft, hairLength: event.target.value })}>{HAIR_LENGTHS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Color del cabello</span><select value={modelDraft.hairColor} onChange={(event) => setModelDraft({ ...modelDraft, hairColor: event.target.value })}>{HAIR_COLORS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Textura del cabello</span><select value={modelDraft.hairTexture} onChange={(event) => setModelDraft({ ...modelDraft, hairTexture: event.target.value })}>{HAIR_TEXTURES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                </div>
                <fieldset className="model-fieldset">
                  <legend>Tono de piel</legend>
                  <div className="model-tones">
                    {SKIN_TONES.map(([id, label, hex]) => (
                      <button key={id} className={modelDraft.skinTone === id ? "active" : ""} type="button" style={{ background: hex }} title={label} aria-label={label} onClick={() => setModelDraft({ ...modelDraft, skinTone: id })} />
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {modelDraft.mode === "photo" && (
              <div className="model-photo-block">
                <ul><li><Check /> Rostro visible y bien iluminado</li><li><Check /> Cuerpo completo o plano americano</li><li><Check /> Pose frontal y fondo simple</li></ul>
                <input ref={faceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { uploadFace(event.target.files?.[0]); event.target.value = ""; }} />
                <button className="tryon-secondary" type="button" onClick={() => faceInput.current?.click()}><UploadSimple size={17} /> {config.hasModelReference ? "Cambiá mi foto" : "Subí mi foto"}</button>
                <p className="model-note">El tono de piel se toma de tu foto. La imagen se guarda únicamente como referencia local para el probador.</p>
              </div>
            )}
            <button className="tryon-primary" type="button" onClick={saveProfile}><Check size={17} /> Guardá y mirá combinaciones</button>
          </div>
          <div className={`profile-image${(modelDraft.mode === "photo" && config.hasModelReference) ? " ready" : ""}`}>
            {modelDraft.mode === "photo" && config.hasModelReference
              ? <img src={config.modelReferenceUrl || "/api/tryon/model-reference"} alt="Referencia personal cargada" />
              : modelDraft.mode === "photo"
                ? <><UserCircle size={72} weight="thin" /><p>Tu foto aparecerá aquí</p></>
                : (
                  <div className="model-summary">
                    <span className="model-summary-tone" style={{ background: SKIN_TONES.find(([id]) => id === modelDraft.skinTone)?.[2] }} />
                    <UserCircle size={72} weight="thin" />
                    <p><strong>{GENDERS.find(([id]) => id === modelDraft.modelGender)?.[1]}</strong> · {AGE_RANGES.find(([id]) => id === modelDraft.ageRange)?.[1]} años</p>
                    <small>{COMPLEXIONS.find(([id]) => id === modelDraft.complexion)?.[1]} · altura {HEIGHTS.find(([id]) => id === modelDraft.height)?.[1]?.toLowerCase()} · piel {SKIN_TONES.find(([id]) => id === modelDraft.skinTone)?.[1]?.toLowerCase()} · cabello {HAIR_COLORS.find(([id]) => id === modelDraft.hairColor)?.[1]?.toLowerCase()}, {HAIR_TEXTURES.find(([id]) => id === modelDraft.hairTexture)?.[1]?.toLowerCase()}.</small>
                  </div>
                )}
            {modelDraft.mode === "photo" && config.hasModelReference && <span><Check weight="bold" /> Lista para probar looks</span>}
          </div>
        </section>
      )}

      {!!compatibleSavedOutfits.filter((item) => item.image).length && section === "suggestions" && (
        <section className="saved-looks">
          <div><p>Tus pruebas</p><h2>Looks generados</h2></div>
          <div>{compatibleSavedOutfits.filter((item) => item.image).map((outfit) => <figure key={outfit.id}><img src={outfit.image} alt={outfit.name} /><figcaption>{outfit.name}</figcaption></figure>)}</div>
        </section>
      )}
    </main>
  );
}
