import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Heart,
  MagicWand,
  Sparkle,
  SpinnerGap,
  UserCircle,
} from "@phosphor-icons/react";
import { effectiveProfileGender, garmentCoverage, garmentFitsModel, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";
import { defaultModelPreset, findModelPreset, findModelStyle, presetsForGender } from "../../shared/model-presets.mjs";
import { readDraft, writeDraft } from "./outfit-draft.js";
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

const GENDERS = [["mujer", "Mujer"], ["hombre", "Hombre"]];

function profileFromPreset(preset, styleId) {
  const style = findModelStyle(preset, styleId);
  return {
    mode: "preset",
    preset: preset.id,
    style: style.id,
    gender: preset.gender,
    catalogGender: preset.gender,
    modelGender: preset.gender,
    complexion: preset.complexion,
    skinTone: preset.skinTone,
    hairColor: style.hairColor,
    hairLength: style.hairLength,
    hairTexture: style.hairTexture,
    ageRange: style.ageRange,
    modelUrl: style.image,
  };
}

function uniqueStyleOptions(styles, valueKey, labelKey) {
  return [...new Map(styles.map((style) => [style[valueKey], { value: style[valueKey], label: style[labelKey] }])).values()];
}

const DEFAULT_MODEL = profileFromPreset(defaultModelPreset("mujer"));

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
  // Las polleras viven en la sección wholebody pero combinan como prenda inferior;
  // solo vestidos y enterizos funcionan como base completa de un look.
  const onePieces = byPart.wholebody.filter((item) => garmentCoverage(item) === "full");
  const bottoms = [...byPart.lowerbody, ...byPart.wholebody.filter((item) => garmentCoverage(item) === "bottom")];
  const hasTwoPieceBase = byPart.upperbody.length && bottoms.length;
  if (!hasTwoPieceBase && !onePieces.length) return [];
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
      for (const bottom of bottoms) addBase([top, bottom], `${top.name || "Superior"} + ${bottom.name || "Inferior"}`);
    }
  }
  for (const onePiece of onePieces) addBase([onePiece], onePiece.name || "Vestido / enterizo");

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
  // El builder arranca con el borrador que dejó la ficha de producto
  // ("Agregar a mi outfit") y lo mantiene sincronizado para el camino inverso.
  const [builder, setBuilder] = useState(() => {
    const seeded = {};
    for (const [part, value] of Object.entries(readDraft())) {
      if (value && typeof value.id === "string") seeded[part] = value.id;
    }
    // Misma exclusividad que selectBuilderGarment: enterizo pisa superior+inferior.
    if (seeded.wholebody) {
      delete seeded.upperbody;
      delete seeded.lowerbody;
    }
    return seeded;
  });
  useEffect(() => {
    writeDraft(Object.fromEntries(Object.entries(builder).filter(([, id]) => id).map(([part, id]) => [part, { id }])));
  }, [builder]);
  const [config, setConfig] = useState({ hasApiKey: false, hasModelReference: false, provider: "gemini", generationMode: "api", profile: null });
  const [modelDraft, setModelDraft] = useState(DEFAULT_MODEL);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const normalizedItems = useMemo(() => items.map(metadata), [items]);
  const modelGender = effectiveProfileGender(modelDraft);
  const genderItems = useMemo(() => normalizedItems.filter((item) => garmentFitsModel(item, modelGender)), [normalizedItems, modelGender]);
  const availablePresets = useMemo(() => presetsForGender(modelGender), [modelGender]);
  const selectedPreset = findModelPreset(modelDraft.preset) || defaultModelPreset(modelGender);
  const selectedStyle = findModelStyle(selectedPreset, modelDraft.style);

  const selectPreset = (preset) => {
    setModelDraft(profileFromPreset(preset));
    setError("");
    setNotice("");
  };

  const selectStyleTrait = (trait, value) => {
    const style = selectedPreset.styles.find((candidate) => candidate[trait] === value) || selectedStyle;
    setModelDraft(profileFromPreset(selectedPreset, style.id));
    setError("");
    setNotice("");
  };

  useEffect(() => {
    Promise.all([
      request("/api/tryon/config"),
      request("/api/tryon/outfits"),
    ]).then(([setup, collection]) => {
      setConfig(setup);
      setSavedOutfits(collection.outfits || []);
      if (setup.profile?.preset) {
        const savedPreset = findModelPreset(setup.profile.preset) || defaultModelPreset(setup.profile.gender);
        setModelDraft(profileFromPreset(savedPreset, setup.profile.style));
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

  const saveProfile = async () => {
    try {
      const profileToSave = profileFromPreset(selectedPreset, selectedStyle.id);
      const saved = await request("/api/tryon/model-profile", { method: "POST", body: JSON.stringify(profileToSave) });
      setConfig((current) => ({ ...current, profile: saved }));
      setModelDraft(profileFromPreset(findModelPreset(saved.preset) || selectedPreset, saved.style));
      setError("");
      setNotice(`${selectedPreset.label} quedó seleccionado. Ya podés probar los looks de la temporada.`);
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
    if (!config.profile?.preset) { setSection("profile"); setError("Elegí primero uno de los modelos IA disponibles."); return; }
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
      if (generationError.status === 409) setSection("profile");
      setError(generationError.status >= 400 && generationError.status < 500 && generationError.message
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
  const manualWhole = genderItems.find((item) => item.id === builder.wholebody) || null;
  const manualWholeCoverage = manualWhole ? garmentCoverage(manualWhole) : null;
  const manualReady = Boolean(
    manualWholeCoverage === "full"
    || (builder.upperbody && (builder.lowerbody || manualWholeCoverage === "bottom")),
  );
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
            <h2>Elegí un modelo IA para tus looks.</h2>
            <p className="profile-lead">Todos los modelos son ficticios, adultos jóvenes y están predeterminados. Elegí entre dos perfiles capilares curados por avatar y mirá el cambio al instante, sin consumir créditos de IA.</p>

            <fieldset className="model-fieldset">
              <legend>Presentación del modelo</legend>
              <div className="model-options">
                {GENDERS.map(([id, label]) => (
                  <button key={id} className={modelGender === id ? "active" : ""} type="button" onClick={() => selectPreset(defaultModelPreset(id))}>{label}</button>
                ))}
              </div>
            </fieldset>

            <fieldset className="model-fieldset model-tone-fieldset">
              <legend>Tono de piel</legend>
              <div className="model-tones model-preset-tones">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    className={selectedPreset.id === preset.id ? "active" : ""}
                    type="button"
                    style={{ "--tone": preset.skinToneColor }}
                    title={`${preset.skinToneLabel} · ${preset.label}`}
                    aria-label={`Elegí tono ${preset.skinToneLabel} con el modelo ${preset.label}`}
                    onClick={() => selectPreset(preset)}
                  ><i /></button>
                ))}
              </div>
            </fieldset>

            <fieldset className="model-fieldset">
              <legend>Avatares disponibles</legend>
              <div className="model-preset-grid">
                {availablePresets.map((preset) => (
                  <button key={preset.id} className={`model-preset-card${selectedPreset.id === preset.id ? " active" : ""}`} type="button" onClick={() => selectPreset(preset)}>
                    <img src={preset.thumbnail} alt="" loading="lazy" />
                    <span><strong>{preset.label}</strong><small>{preset.skinToneLabel}</small></span>
                    <em>{preset.appearance}</em>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="model-fieldset model-style-fieldset">
              <legend>Cabello y edad aproximada</legend>
              <p className="model-style-intro">Mostramos sólo dos combinaciones armónicas para este avatar. Al cambiar un dato, los demás se ajustan al perfil compatible.</p>
              <div className="model-style-grid">
                <label>
                  <span>Color de pelo</span>
                  <select value={selectedStyle.hairColor} onChange={(event) => selectStyleTrait("hairColor", event.target.value)}>
                    {uniqueStyleOptions(selectedPreset.styles, "hairColor", "hairColorLabel").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Largo</span>
                  <select value={selectedStyle.hairLength} onChange={(event) => selectStyleTrait("hairLength", event.target.value)}>
                    {uniqueStyleOptions(selectedPreset.styles, "hairLength", "hairLengthLabel").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Textura</span>
                  <select value={selectedStyle.hairTexture} onChange={(event) => selectStyleTrait("hairTexture", event.target.value)}>
                    {uniqueStyleOptions(selectedPreset.styles, "hairTexture", "hairTextureLabel").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Edad aproximada</span>
                  <select value={selectedStyle.ageRange} onChange={(event) => selectStyleTrait("ageRange", event.target.value)}>
                    {uniqueStyleOptions(selectedPreset.styles, "ageRange", "ageRangeLabel").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="model-style-current"><Sparkle weight="fill" /> Perfil seleccionado: <strong>{selectedStyle.label}</strong></div>
            </fieldset>

            <div className="model-inclusion-note">
              <strong>Una biblioteca inclusiva, sin etiquetas rígidas.</strong>
              <p>Los perfiles describen únicamente los rasgos visibles de estos avatares ficticios. No representan personalidad, nacionalidad ni preferencias, y ninguna apariencia se vincula a una prenda u ocasión.</p>
            </div>
            <p className="model-note">Las prendas específicas de mujer u hombre sólo aparecen para el modelo compatible. Las prendas unisex aparecen en ambos.</p>
            <button className="tryon-primary" type="button" onClick={saveProfile}><Check size={17} /> Usá a {selectedPreset.label} y mirá combinaciones</button>
          </div>
          <div className="profile-image preset-profile-image ready" aria-live="polite">
            <img key={`${selectedPreset.id}-${selectedStyle.id}`} src={selectedStyle.image} alt={`Modelo IA ${selectedPreset.label}: ${selectedPreset.appearance}, pelo ${selectedStyle.hairColorLabel} ${selectedStyle.hairTextureLabel}`} />
            <div className="preset-profile-caption">
              <span><Check weight="bold" /> Vista previa instantánea</span>
              <h3>{selectedPreset.label}</h3>
              <p>{selectedPreset.appearance}</p>
              <small>{selectedStyle.hairColorLabel} · {selectedStyle.hairLengthLabel} · {selectedStyle.hairTextureLabel} · {selectedStyle.ageRangeLabel}</small>
            </div>
          </div>
        </section>
      )}

      {!!compatibleSavedOutfits.filter((item) => item.image).length && (section === "suggestions" || section === "builder") && (
        <section className="saved-looks">
          <div><p>Tus pruebas</p><h2>Looks generados</h2></div>
          <div>{compatibleSavedOutfits.filter((item) => item.image).map((outfit) => <figure key={outfit.id}><img src={outfit.image} alt={outfit.name} /><figcaption>{outfit.name}</figcaption></figure>)}</div>
        </section>
      )}
    </main>
  );
}
