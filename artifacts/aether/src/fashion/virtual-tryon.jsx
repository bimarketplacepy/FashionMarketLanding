import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CloudSun,
  Heart,
  MagicWand,
  Plus,
  Sparkle,
  SpinnerGap,
  TShirt,
  UploadSimple,
  UserCircle,
} from "@phosphor-icons/react";
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
        <div className="match-score"><Sparkle size={12} weight="fill" /> {outfit.score}% match</div>
        <button className={`look-heart${saved ? " active" : ""}`} type="button" onClick={() => onSave(outfit)} aria-label="Guardar look"><Heart size={18} weight={saved ? "fill" : "regular"} /></button>
      </div>
      <div className="tryon-look-copy">
        <div><p>{outfit.occasion} · {outfit.climate}</p><h3>{outfit.name}</h3></div>
        <p>{outfit.reason}</p>
        <div className="look-garment-pills">{outfit.garments.map((item) => <span key={item.id} style={{ "--swatch": item.color }}>{item.name}</span>)}</div>
        <button className="tryon-primary" type="button" disabled={busy} onClick={() => onGenerate(outfit)}>
          {busy ? <SpinnerGap className="spin" size={17} /> : <MagicWand size={17} />} {outfit.image ? "Regenerar prueba" : "Probar este look"}
        </button>
      </div>
    </article>
  );
}

export function VirtualTryOn({ items, onAddProducts, onOpenItem }) {
  const [section, setSection] = useState("suggestions");
  const [filters, setFilters] = useState({ season: "autumn", occasion: "casual", climate: "mild" });
  const [count, setCount] = useState(6);
  const [suggestions, setSuggestions] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [builder, setBuilder] = useState({});
  const [config, setConfig] = useState({ hasApiKey: false, hasModelReference: false, provider: "gemini" });
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const faceInput = useRef(null);
  const normalizedItems = useMemo(() => items.map(metadata), [items]);

  useEffect(() => {
    Promise.all([
      request("/api/tryon/config"),
      request("/api/tryon/outfits"),
    ]).then(([setup, collection]) => {
      setConfig(setup);
      setSavedOutfits(collection.outfits || []);
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    setSuggestions(buildSuggestions(normalizedItems, filters, count));
  }, [normalizedItems, filters, count]);

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

  const saveOutfit = async (outfit) => {
    try {
      const saved = await request("/api/tryon/outfits", { method: "POST", body: JSON.stringify(outfit) });
      setSavedOutfits((current) => [...current.filter((item) => item.id !== saved.id && [...item.garmentIds].sort().join("|") !== [...saved.garmentIds].sort().join("|")), saved]);
      setNotice("Look guardado.");
    } catch (saveError) { setError(saveError.message); }
  };

  const generate = async (outfit) => {
    if (!config.hasModelReference) { setSection("profile"); setError("Subí una foto de referencia antes de generar la prueba virtual."); return; }
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
  const catalogCounts = Object.fromEntries(PARTS.map(([part]) => [part, normalizedItems.filter((item) => item.part === part).length]));

  return (
    <main className="tryon-shell">
      <header className="tryon-header">
        <div>
          <p>Probador virtual</p>
          <h1>Un look para cada momento.</h1>
        </div>
        <button className="tryon-add" type="button" onClick={onAddProducts}><Plus size={17} /> Cargar prendas</button>
      </header>

      <nav className="tryon-tabs" aria-label="Secciones del probador">
        {[["suggestions", "Looks sugeridos", Sparkle], ["builder", "Crear un look", MagicWand], ["catalog", `Prendas (${items.length})`, TShirt], ["profile", "Mi referencia", UserCircle]].map(([id, label, Icon]) => (
          <button key={id} className={section === id ? "active" : ""} type="button" onClick={() => setSection(id)}><Icon size={17} /> {label}</button>
        ))}
      </nav>

      {(notice || error) && <div className={`tryon-notice${error ? " error" : ""}`} role="status">{error || notice}<button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

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
            <div className="tryon-empty"><Sparkle size={30} /><h3>Necesitamos una parte superior y una inferior</h3><p>Cargá prendas de la temporada para comenzar a crear combinaciones.</p><button type="button" onClick={onAddProducts}>Cargar primeras prendas</button></div>
          )}
        </section>
      )}

      {section === "builder" && (
        <section className="tryon-section builder-section">
          <div className="tryon-section-heading"><div><p>Combinación libre</p><h2>Creá tu propio look</h2></div><p>Elegí una prenda de cada categoría. La parte superior y la inferior son obligatorias; el resto es opcional.</p></div>
          <div className="builder-layout">
            <div className="builder-selectors">
              {PARTS.map(([part, label]) => (
                <fieldset key={part}>
                  <legend>{label} <small>{["upperbody", "lowerbody"].includes(part) ? "obligatorio" : "opcional"}</small></legend>
                  <div className="builder-options">
                    {!["upperbody", "lowerbody"].includes(part) && <button className={!builder[part] ? "active empty-option" : "empty-option"} type="button" onClick={() => setBuilder({ ...builder, [part]: null })}>Sin {label.toLowerCase()}</button>}
                    {normalizedItems.filter((item) => item.part === part).map((item) => <button className={builder[part] === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setBuilder({ ...builder, [part]: item.id })}><img src={item.thumbnail || item.image} alt="" /><span>{item.name}</span></button>)}
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

      {section === "catalog" && (
        <section className="tryon-section">
          <div className="tryon-section-heading"><div><p>Catálogo local</p><h2>Prendas de temporada</h2></div><p>Cada producto aprobado conserva sus atributos visuales para alimentar el motor de combinaciones.</p></div>
          <div className="catalog-summary">{PARTS.map(([part, label]) => <span key={part}><strong>{catalogCounts[part]}</strong>{label}</span>)}<button type="button" onClick={onAddProducts}><UploadSimple size={18} /> Cargar producto</button></div>
          {normalizedItems.length ? <div className="tryon-catalog-grid">{normalizedItems.map((item) => <button type="button" key={item.id} onClick={() => onOpenItem(item.id)}><div><img src={item.thumbnail || item.image} alt="" /><span style={{ background: item.color }} /></div><p>{item.season === "all" ? "Todo el año" : item.season} · {item.material}</p><h3>{item.name}</h3><small>{item.silhouette} · {item.weight}</small></button>)}</div> : <div className="tryon-empty"><TShirt size={30} /><h3>El catálogo está vacío</h3><p>Podés cargar una foto de producto o una fotografía donde la prenda esté siendo usada.</p><button type="button" onClick={onAddProducts}>Cargar productos</button></div>}
        </section>
      )}

      {section === "profile" && (
        <section className="tryon-section profile-section">
          <div className="profile-copy">
            <p>Referencia personal</p>
            <h2>Tu rostro, tus proporciones, tu identidad.</h2>
            <p>Esta foto se usa únicamente como referencia local para generar las pruebas virtuales. No forma parte del catálogo.</p>
            <ul><li><Check /> Rostro visible y bien iluminado</li><li><Check /> Cuerpo completo o plano americano</li><li><Check /> Pose frontal y fondo simple</li></ul>
            <input ref={faceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { uploadFace(event.target.files?.[0]); event.target.value = ""; }} />
            <button className="tryon-primary" type="button" onClick={() => faceInput.current?.click()}><UploadSimple size={17} /> {config.hasModelReference ? "Cambiar mi referencia" : "Subir mi foto"}</button>
            <p className="profile-provider">Proveedor activo: <strong>{config.provider === "gemini" ? "Google Gemini" : "OpenAI"}</strong></p>
            {!config.hasApiKey && <p className="profile-warning">Para generar imágenes también necesitás configurar <code>{config.provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"}</code> en el archivo <code>.env</code>.</p>}
          </div>
          <div className={`profile-image${config.hasModelReference ? " ready" : ""}`}>
            {config.hasModelReference ? <img src={config.modelReferenceUrl || "/api/tryon/model-reference"} alt="Referencia personal cargada" /> : <><UserCircle size={72} weight="thin" /><p>Tu referencia aparecerá aquí</p></>}
            {config.hasModelReference && <span><Check weight="bold" /> Lista para probar looks</span>}
          </div>
        </section>
      )}

      {!!savedOutfits.filter((item) => item.image).length && section === "suggestions" && (
        <section className="saved-looks">
          <div><p>Tus pruebas</p><h2>Looks generados</h2></div>
          <div>{savedOutfits.filter((item) => item.image).map((outfit) => <figure key={outfit.id}><img src={outfit.image} alt={outfit.name} /><figcaption>{outfit.name}</figcaption></figure>)}</div>
        </section>
      )}
    </main>
  );
}
