import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Heart, List, MagicWand, MagnifyingGlass, SpinnerGap, Trash } from "@phosphor-icons/react";
import { useCatalog } from "./catalog-context.jsx";
import { readDraft, writeDraft, draftFromOutfit } from "./outfit-draft.js";
import { sugerirPrendas } from "./sugerencias.js";
import { SuggestionCarousel } from "./SuggestionCarousel.jsx";
import { PART_LABELS } from "./format.js";
import { garmentFitsModel } from "../../shared/garment-gender.mjs";
import "./styles.css";
import "./shop.css";

// Slots del outfit: superior e inferior son la base del look; el resto es opcional.
const SLOTS = [
  ["upperbody", "Superior"],
  ["wholebody_up", "Abrigo"],
  ["lowerbody", "Inferior"],
  ["shoes", "Calzado"],
  ["accessories_up", "Accesorios"],
];

const SLOT_LABELS = Object.fromEntries(SLOTS);

const CATALOG_FILTERS = [["all", "Todo"], ...SLOTS];

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

export function OutfitBuilderPage() {
  const [, navigate] = useLocation();
  const { items, loading, error: catalogError } = useCatalog();
  const [slots, setSlots] = useState(() => readDraft());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [profileGender, setProfileGender] = useState(null);
  const [tryOn, setTryOn] = useState({ busy: false, image: null });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    Promise.all([
      fetch("/api/tryon/outfits").then((response) => response.ok ? response.json() : { outfits: [] }),
      fetch("/api/tryon/config").then((response) => response.ok ? response.json() : { profile: null }),
    ])
      .then(([collection, config]) => {
        setSavedOutfits(collection.outfits || []);
        setProfileGender(config.profile?.gender === "hombre" ? "hombre" : (config.profile ? "mujer" : null));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    writeDraft(slots);
  }, [slots]);

  const compatibleItems = useMemo(
    () => profileGender ? items.filter((item) => garmentFitsModel(item, profileGender)) : items,
    [items, profileGender],
  );
  const itemById = useMemo(() => new Map(compatibleItems.map((item) => [item.id, item])), [compatibleItems]);

  useEffect(() => {
    if (loading) return;
    setSlots((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, entry]) => itemById.has(entry.id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [itemById, loading]);

  const slotGarments = useMemo(() => {
    const result = {};
    for (const [part] of SLOTS) {
      const entry = slots[part];
      result[part] = entry ? itemById.get(entry.id) || null : null;
    }
    return result;
  }, [slots, itemById]);

  const chosenGarments = SLOTS.map(([part]) => slotGarments[part]).filter(Boolean);
  const outfitReady = Boolean(slotGarments.upperbody && slotGarments.lowerbody);

  // Sugerencias bajo el lienzo: solo categorías de slots vacíos, recalculadas
  // con cada prenda que entra o sale del outfit.
  const sugerencias = useMemo(
    () => (chosenGarments.length ? sugerirPrendas({ outfit: slotGarments, items: compatibleItems, outfits: savedOutfits }) : []),
    [slotGarments, compatibleItems, savedOutfits, chosenGarments.length],
  );

  const catalogItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return compatibleItems.filter((item) => {
      if (filter !== "all" && item.part !== filter) return false;
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || (item.tags || []).some((tag) => tag.toLowerCase().includes(query));
    });
  }, [compatibleItems, filter, search]);

  const compatibleSavedOutfits = useMemo(() => {
    const ids = new Set(compatibleItems.map((item) => item.id));
    return savedOutfits.filter((outfit) => outfit.garmentIds.every((id) => ids.has(id)));
  }, [compatibleItems, savedOutfits]);

  const assign = (item) => {
    setSlots((current) => ({ ...current, [item.part]: { id: item.id } }));
    setNotice(`${item.name} en el slot ${SLOT_LABELS[item.part]?.toLowerCase() || item.part}.`);
  };

  const clearSlot = (part) => {
    setSlots((current) => {
      const next = { ...current };
      delete next[part];
      return next;
    });
  };

  const onDrop = (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const item = itemById.get(id);
    if (item) assign(item);
  };

  const loadOutfit = (outfit) => {
    if (!outfit) return;
    setSlots(draftFromOutfit(outfit, items));
    setTryOn({ busy: false, image: outfit.image || null });
    setNotice(`Look "${outfit.name}" cargado en el builder.`);
  };

  const buildOutfit = () => ({
    name: "Mi outfit",
    garmentIds: chosenGarments.map((garment) => garment.id),
    reason: "Outfit armado libremente en el builder.",
    score: 100,
    occasion: "casual",
    season: "all",
    climate: "mild",
    source: "manual",
    status: "planned",
  });

  const saveLook = async () => {
    if (!outfitReady) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const saved = await request("/api/tryon/outfits", { method: "POST", body: JSON.stringify(buildOutfit()) });
      setSavedOutfits((current) => [...current.filter((outfit) => outfit.id !== saved.id), saved]);
      setNotice("Look guardado. Lo vas a encontrar en el tab Outfits del catálogo.");
    } catch (saveError) {
      setErrorMessage(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const generateTryOn = async () => {
    if (!outfitReady) return;
    setErrorMessage("");
    setTryOn((current) => ({ ...current, busy: true }));
    try {
      const config = await request("/api/tryon/config");
      if (!config.profile) {
        throw new Error("Primero elegí tu modelo en el catálogo (botón \"Mi modelo\").");
      }
      const generated = await request("/api/tryon/generate", { method: "POST", body: JSON.stringify(buildOutfit()) });
      setTryOn({ busy: false, image: generated.image });
      setNotice("Tu prueba virtual está lista.");
    } catch (generationError) {
      setTryOn((current) => ({ ...current, busy: false }));
      setErrorMessage(generationError.message);
    }
  };

  return (
    <div className="app-shell retail-wardrobe builder-page">
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><span>FASHION MARKET</span><small>By Marketplace</small></button>
        <p>Armá tu outfit</p>
        <div className="topbar-actions">
          <button className="retail-outline-button" type="button" onClick={() => navigate("/catalogo")}><List size={17} /> Ver catálogo</button>
        </div>
      </header>

      {(notice || errorMessage || catalogError) && (
        <div className={`tryon-notice${errorMessage || catalogError ? " error" : ""}`} role="status">
          {errorMessage || catalogError || notice}
          <button type="button" onClick={() => { setNotice(""); setErrorMessage(""); }}>×</button>
        </div>
      )}

      {loading ? <p className="status">Preparando el builder…</p> : (
        <main className="builder-shell">
          <section className="builder-slots-panel" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <div className="builder-heading">
              <div>
                <p>Combinación libre</p>
                <h2>Armá tu outfit</h2>
              </div>
              {compatibleSavedOutfits.length > 0 && (
                <label className="builder-load">
                  <span>Cargar un look guardado</span>
                  <select value="" onChange={(event) => loadOutfit(compatibleSavedOutfits.find((outfit) => outfit.id === event.target.value))}>
                    <option value="" disabled>Elegir look…</option>
                    {compatibleSavedOutfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}
                  </select>
                </label>
              )}
            </div>

            <div className="builder-slots">
              {SLOTS.map(([part, label]) => {
                const garment = slotGarments[part];
                const optionalTag = ["upperbody", "lowerbody"].includes(part) ? "" : " · opcional";
                return (
                  <div
                    key={part}
                    className={`builder-slot${garment ? " filled" : ""}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={onDrop}
                  >
                    <header><span>{label}<small>{optionalTag}</small></span>
                      {garment && <button type="button" onClick={() => clearSlot(part)} aria-label={`Quitar ${garment.name}`}><Trash size={14} /></button>}
                    </header>
                    {garment ? (
                      <div className="builder-slot-body">
                        <img src={garment.thumbnail || garment.image} alt="" />
                        <div>
                          <strong>{garment.name}</strong>
                          <em>{PART_LABELS[garment.part]}</em>
                        </div>
                      </div>
                    ) : (
                      <p className="builder-slot-empty">Arrastrá una prenda acá o elegila del catálogo →</p>
                    )}
                  </div>
                );
              })}
            </div>

            <aside className="builder-summary">
              {tryOn.image && (
                <figure className="builder-tryon-result">
                  <img src={tryOn.image} alt="Prueba virtual del outfit" />
                  <figcaption>Tu prueba virtual</figcaption>
                </figure>
              )}
              <button className="tryon-primary" type="button" disabled={!outfitReady || tryOn.busy} onClick={generateTryOn}>
                {tryOn.busy ? <SpinnerGap className="spin" size={16} /> : <MagicWand size={16} />} Probar en el modelo
              </button>
              <button className="tryon-secondary" type="button" disabled={!outfitReady || saving} onClick={saveLook}>
                <Heart size={16} /> {saving ? "Guardando…" : "Guardar look"}
              </button>
              {!outfitReady && <p className="builder-hint">Elegí al menos una prenda superior y una inferior.</p>}
            </aside>

            {chosenGarments.length > 0 && (
              <SuggestionCarousel
                title="Sugerencias para tu outfit"
                suggestions={sugerencias}
                action="add"
                onAdd={assign}
              />
            )}
          </section>

          <section className="builder-catalog-panel">
            <div className="builder-catalog-tools">
              <div className="builder-search">
                <MagnifyingGlass size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar prendas…"
                  aria-label="Buscar en el catálogo"
                />
              </div>
              <div className="builder-filter-chips">
                {CATALOG_FILTERS.map(([id, label]) => (
                  <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="builder-catalog-grid">
              {catalogItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`builder-catalog-item${slots[item.part]?.id === item.id ? " active" : ""}`}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                  onClick={() => assign(item)}
                  title={item.name}
                >
                  <img src={item.thumbnail || item.image} alt="" loading="lazy" />
                  <span>{item.name}</span>
                </button>
              ))}
              {!catalogItems.length && <p className="builder-catalog-empty">No hay prendas que coincidan con la búsqueda.</p>}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
