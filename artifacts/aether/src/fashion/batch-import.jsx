import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise, ArrowLeft, CaretRight, Check, ClipboardText, CopySimple,
  FolderOpen, Plus, SpinnerGap, Trash, UploadSimple, WarningCircle, X,
} from "@phosphor-icons/react";
import { useCatalog } from "./catalog-context.jsx";
import { formatPriceGs, PART_LABELS } from "./format.js";
import { SHOW_PRICES } from "../site-config.js";
import "./batch-import.css";

const API = "/api/batches";

const CATEGORIAS = [
  ["upperbody", "Prendas superiores"],
  ["wholebody", "Vestidos y enterizos"],
  ["wholebody_up", "Abrigos"],
  ["lowerbody", "Prendas inferiores"],
  ["shoes", "Calzado"],
  ["accessories_up", "Accesorios"],
];

const ESTADOS = {
  pendiente: ["Pendiente de análisis", "gris"],
  en_cola: ["En cola", "gris"],
  analizando: ["Analizando…", "azul"],
  esperando_cuota: ["En espera por cuota", "amarillo"],
  analizada: ["Analizada", "azul"],
  error: ["Error", "rojo"],
  importada: ["Importada", "verde"],
  descartada: ["Descartada", "gris"],
};

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "No se pudo completar la acción.");
  return value;
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
  reader.readAsDataURL(file);
});

// Recorre carpetas arrastradas (webkitGetAsEntry) y devuelve archivos + nombre
// de la primera carpeta y la carpeta inmediata de cada archivo.
async function collectDropped(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length || entries.every((entry) => entry.isFile)) {
    return { files: [...dataTransfer.files].map((file) => ({ file, folder: null })), folder: null };
  }
  const files = [];
  let folder = null;
  async function walk(entry, parentFolder) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      files.push({ file, folder: parentFolder });
      return;
    }
    if (entry.isDirectory) {
      if (!folder) folder = entry.name;
      const reader = entry.createReader();
      for (;;) {
        const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await walk(child, entry.name);
      }
    }
  }
  for (const entry of entries) await walk(entry, null);
  return { files, folder };
}

// Descomprime un .zip en el navegador y devuelve sus imágenes como File, con la
// carpeta inmediata de cada una. Así un zip grande se sube imagen por imagen en
// vez de viajar entero como un único JSON en base64 (que los proxies cortan).
async function readZipImages(zip) {
  const tailSize = Math.min(zip.size, 22 + 65535);
  const tail = new DataView(await zip.slice(zip.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let index = tailSize - 22; index >= 0; index -= 1) {
    if (tail.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error(`"${zip.name}" no es un archivo ZIP válido.`);
  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || dirOffset === 0xffffffff) throw new Error(`"${zip.name}" usa formato ZIP64; comprimilo de nuevo en partes más chicas.`);
  const dir = new DataView(await zip.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const decoder = new TextDecoder();
  const images = [];
  let ignored = 0;
  let offset = 0;
  for (let index = 0; index < count && offset + 46 <= dir.byteLength; index += 1) {
    if (dir.getUint32(offset, true) !== 0x02014b50) break;
    const method = dir.getUint16(offset + 10, true);
    const compressedSize = dir.getUint32(offset + 20, true);
    const nameLength = dir.getUint16(offset + 28, true);
    const extraLength = dir.getUint16(offset + 30, true);
    const commentLength = dir.getUint16(offset + 32, true);
    const localOffset = dir.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, offset + 46, nameLength)).replaceAll("\\", "/");
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const parts = name.split("/").filter(Boolean);
    const base = parts[parts.length - 1] || "";
    if (name.includes("__MACOSX") || !isImage({ name: base }) || (method !== 0 && method !== 8)) { ignored += 1; continue; }
    const header = new DataView(await zip.slice(localOffset, localOffset + 30).arrayBuffer());
    const dataStart = localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const raw = zip.slice(dataStart, dataStart + compressedSize);
    const blob = method === 0 ? raw : await new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    images.push({ file: new File([blob], base), folder: parts.length > 1 ? parts[parts.length - 2] : null });
  }
  return { images, ignored };
}

// Sube tareas de a 4 en paralelo, informando progreso.
async function pool(tasks, onProgress, size = 4) {
  let index = 0;
  let done = 0;
  const results = [];
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (index < tasks.length) {
      const current = index += 1, position = current - 1;
      try { results[position] = await tasks[position](); }
      catch (error) { results[position] = { error: error.message }; }
      done += 1;
      onProgress?.(done, tasks.length);
    }
  }));
  return results;
}

const isImage = (file) => /\.(jpe?g|png|webp)$/i.test(file.name) && !file.name.startsWith(".");
const isZip = (file) => /\.zip$/i.test(file.name);

function EstadoChip({ item }) {
  const advertencia = item.estado === "analizada" && item.advertencia;
  const [label, tone] = advertencia ? ["Advertencia", "amarillo"] : ESTADOS[item.estado] || ["", "gris"];
  return <span className={`bi-chip bi-chip--${tone}`}>{["analizando", "en_cola"].includes(item.estado) && <SpinnerGap className="spin" size={12} />}{label}</span>;
}

// Preview de cómo quedará la card en el catálogo real: mismas clases que la
// grilla del vestidor (wd-piece / wd-piece-caption).
function CatalogPreview({ item, batchId }) {
  return (
    <div className="bi-preview wd-piece" aria-hidden="true">
      <div className="bi-preview-frame">
        <img src={`${API}/assets/${batchId}/${item.file}`} alt="" loading="lazy" />
      </div>
      <span className="wd-piece-caption"><span>{item.ficha?.nombre || item.fileName}</span></span>
      <span className="bi-preview-meta">
        {item.ficha?.categoriaInterna ? PART_LABELS[item.ficha.categoriaInterna] : "Sin categoría"}
        {SHOW_PRICES && typeof item.ficha?.precio === "number" ? ` · ${formatPriceGs(item.ficha.precio)}` : ""}
      </span>
      {item.ficha?.colores?.length > 0 && (
        <span className="bi-swatches">{item.ficha.colores.map((color) => <i key={color} style={{ background: color }} title={color} />)}</span>
      )}
    </div>
  );
}

function ItemCard({ item, batchId, config, busy, onPatch, onAction }) {
  const [draft, setDraft] = useState(item.ficha);
  useEffect(() => { setDraft(item.ficha); }, [item.id, item.estado, item.duplicateOf?.id]);

  const commit = (patch) => onPatch(item, patch);
  const discarded = item.estado === "descartada";
  const imported = item.estado === "importada";
  const editable = !discarded && !imported;
  const showWarning = item.estado === "analizada" && item.advertencia;

  const setColor = (index, value) => {
    const colores = [...(draft.colores || [])];
    colores[index] = value;
    setDraft({ ...draft, colores });
    commit({ colores });
  };

  return (
    <article className={`bi-card is-${showWarning ? "amarillo" : (ESTADOS[item.estado] || [])[1] || "gris"}`}>
      <CatalogPreview item={item} batchId={batchId} />
      <div className="bi-card-body">
        <header className="bi-card-head">
          <EstadoChip item={item} />
          <small title={item.folderName ? `${item.folderName}/${item.fileName}` : item.fileName}>{item.fileName}</small>
        </header>

        {showWarning && <p className="bi-alert bi-alert--amarillo"><WarningCircle size={14} /> {item.advertencia}</p>}
        {item.estado === "error" && (
          <p className="bi-alert bi-alert--rojo">
            <WarningCircle size={14} /> {item.error || "El análisis falló."}
            <button type="button" disabled={busy} onClick={() => onAction(item, "analyze")}><ArrowCounterClockwise size={12} /> Reintentar</button>
          </p>
        )}
        {item.duplicateOf && editable && (
          <div className="bi-alert bi-alert--duplicado">
            <span><WarningCircle size={14} /> Posible duplicado de «{item.duplicateOf.name}»</span>
            <span className="bi-dup-actions">
              <button type="button" disabled={busy} onClick={() => onAction(item, "import", { unifyWith: item.duplicateOf.id })}>Unificar</button>
              <button type="button" disabled={busy} onClick={() => onAction(item, "import", { force: true })}>Crear igual</button>
            </span>
          </div>
        )}

        {editable && (
          <div className="bi-fields">
            <label><span>Nombre</span>
              <input value={draft.nombre || ""} onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} onBlur={() => commit({ nombre: draft.nombre })} />
            </label>
            <label><span>Categoría</span>
              <select value={draft.categoriaInterna || ""} onChange={(event) => { setDraft({ ...draft, categoriaInterna: event.target.value }); commit({ categoriaInterna: event.target.value }); }}>
                <option value="" disabled>Elegir…</option>
                {CATEGORIAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <div className="bi-color-row">
              <span>Colores</span>
              {(draft.colores || []).map((color, index) => (
                <span className="bi-color-slot" key={index}>
                  <input type="color" value={color} onChange={(event) => setColor(index, event.target.value)} />
                  <button type="button" aria-label="Quitar color" onClick={() => { const colores = draft.colores.filter((_, i) => i !== index); setDraft({ ...draft, colores }); commit({ colores }); }}><X size={10} /></button>
                </span>
              ))}
              {(draft.colores || []).length < 3 && (
                <button className="bi-color-add" type="button" onClick={() => setColor((draft.colores || []).length, "#888888")} aria-label="Agregar color"><Plus size={12} /></button>
              )}
            </div>
            {SHOW_PRICES && <label><span>Precio (₲)</span>
              <input
                inputMode="numeric"
                placeholder="Sin precio"
                value={draft.precio ?? ""}
                onChange={(event) => setDraft({ ...draft, precio: event.target.value.replaceAll(/[^0-9]/g, "") })}
                onBlur={() => commit({ precio: draft.precio === "" || draft.precio === null ? null : Number(draft.precio) })}
              />
            </label>}
            <label className="bi-field-wide"><span>Descripción</span>
              <textarea rows="2" value={draft.descripcion || ""} onChange={(event) => setDraft({ ...draft, descripcion: event.target.value })} onBlur={() => commit({ descripcion: draft.descripcion })} />
            </label>
          </div>
        )}

        {item.ficha?.prendasSecundarias?.length > 0 && editable && (
          <div className="bi-secondaries">
            <span>También se ve:</span>
            {item.ficha.prendasSecundarias.map((prenda) => (
              <button key={prenda} type="button" disabled={busy} title="Crear también esta prenda" onClick={() => onAction(item, "secondary", { nombre: prenda })}>
                {prenda} <Plus size={11} />
              </button>
            ))}
          </div>
        )}

        <footer className="bi-card-actions">
          {imported && <span className="bi-imported"><Check size={14} weight="bold" /> En el catálogo</span>}
          {discarded && <button className="bi-button" type="button" disabled={busy} onClick={() => onAction(item, "restore")}><ArrowCounterClockwise size={13} /> Recuperar</button>}
          {editable && (
            <>
              <button className="bi-button" type="button" disabled={busy} onClick={() => onAction(item, "discard")}><Trash size={13} /> Descartar</button>
              {!item.duplicateOf && (
                <button
                  className="bi-button bi-button--primary"
                  type="button"
                  disabled={busy || !draft.nombre || !draft.categoriaInterna}
                  title={!draft.nombre || !draft.categoriaInterna ? "Completá nombre y categoría" : undefined}
                  onClick={() => onAction(item, "import")}
                ><Check size={13} weight="bold" /> Importar</button>
              )}
            </>
          )}
        </footer>
      </div>
    </article>
  );
}

export function BatchImportPanel({ onBack }) {
  const { addImportedItem } = useCatalog();
  const [config, setConfig] = useState(null);
  const [batches, setBatches] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [batch, setBatch] = useState(null);
  const [tab, setTab] = useState("activas");
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState(null); // { done, total }
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [copied, setCopied] = useState(false);
  const folderInput = useRef(null);
  const filesInput = useRef(null);

  const refreshBatches = useCallback(() => api(API).then(setBatches).catch((requestError) => setError(requestError.message)), []);
  const refreshBatch = useCallback((id) => api(`${API}/${id}`).then((detail) => {
    setBatch(detail);
    if (detail.quotaExhausted !== undefined) setConfig((current) => current ? { ...current, quotaExhausted: detail.quotaExhausted } : current);
  }).catch((requestError) => setError(requestError.message)), []);

  useEffect(() => {
    api(`${API}/config`).then(setConfig).catch(() => setConfig({ provider: "manual", auto: false }));
    refreshBatches();
  }, [refreshBatches]);

  useEffect(() => {
    if (activeId) refreshBatch(activeId);
    else setBatch(null);
  }, [activeId, refreshBatch]);

  // Polling mientras hay análisis en curso.
  const analyzing = batch?.items.some((item) => ["en_cola", "analizando", "esperando_cuota"].includes(item.estado));
  useEffect(() => {
    if (!analyzing || !activeId) return undefined;
    const timer = setInterval(() => refreshBatch(activeId), 1500);
    return () => clearInterval(timer);
  }, [analyzing, activeId, refreshBatch]);

  const uploadFiles = useCallback(async (entries, suggestedName) => {
    setError("");
    const images = entries.filter(({ file }) => isImage(file));
    const zips = entries.filter(({ file }) => isZip(file));
    let ignored = entries.length - images.length - zips.length;
    if (!images.length && !zips.length) {
      setNotice(`0 subidas, ${entries.length} ignoradas (solo jpg, jpeg, png, webp o zip).`);
      return;
    }
    try {
      if (zips.length) setNotice(`Descomprimiendo ${zips.length === 1 ? zips[0].file.name : `${zips.length} archivos .zip`}…`);
      for (const { file } of zips) {
        const extracted = await readZipImages(file);
        images.push(...extracted.images);
        ignored += extracted.ignored;
      }
      if (!images.length) {
        setNotice(`0 subidas, ${ignored} ignoradas (el .zip no tenía imágenes jpg, jpeg, png o webp).`);
        return;
      }
      const name = suggestedName || (zips[0] ? zips[0].file.name.replace(/\.zip$/i, "") : null) || `Lote ${new Date().toLocaleString("es")}`;
      const created = await api(API, { method: "POST", body: JSON.stringify({ name }) });
      let agregadas = 0;
      setUpload({ done: 0, total: images.length });
      const tasks = images.map(({ file, folder }) => async () => {
        const imageDataUrl = await fileToDataUrl(file);
        await api(`${API}/${created.id}/images`, { method: "POST", body: JSON.stringify({ imageDataUrl, fileName: file.name, folderName: folder }) });
        agregadas += 1;
      });
      const results = await pool(tasks, (done, total) => setUpload({ done, total }));
      const failures = results.filter((result) => result?.error);
      setUpload(null);
      setNotice(`${agregadas} subidas, ${ignored + failures.length} ignoradas.${failures.length ? ` Error: ${failures[0].error}` : ""}`);
      await refreshBatches();
      setActiveId(created.id);
      setTab("activas");
    } catch (uploadError) {
      setUpload(null);
      setError(uploadError.message);
    }
  }, [refreshBatches]);

  const onDrop = useCallback(async (event) => {
    event.preventDefault();
    setDragging(false);
    const { files, folder } = await collectDropped(event.dataTransfer);
    uploadFiles(files, folder);
  }, [uploadFiles]);

  const onPickFolder = (event) => {
    const files = [...event.target.files].map((file) => ({
      file,
      folder: file.webkitRelativePath?.split("/").slice(-2, -1)[0] || null,
    }));
    const root = files[0]?.file.webkitRelativePath?.split("/")[0] || null;
    uploadFiles(files, root);
    event.target.value = "";
  };

  const onPickFiles = (event) => {
    uploadFiles([...event.target.files].map((file) => ({ file, folder: null })));
    event.target.value = "";
  };

  const patchItem = async (item, patch) => {
    try {
      const updated = await api(`${API}/${batch.id}/items/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setBatch((current) => current ? { ...current, items: current.items.map((entry) => entry.id === updated.id ? updated : entry) } : current);
    } catch (patchError) { setError(patchError.message); }
  };

  const itemAction = async (item, verb, payload) => {
    setBusyId(item.id);
    setError("");
    try {
      const result = await api(`${API}/${batch.id}/items/${item.id}/${verb}`, { method: "POST", body: JSON.stringify(payload || {}) });
      if (verb === "import" && result.record && !result.unified) addImportedItem(result.record);
      if (verb === "import" && result.unified) setNotice(`Foto agregada a «${result.record.name}».`);
      if (verb === "secondary") setNotice(`Se creó "${result.ficha?.nombre}" en el lote, pendiente de análisis.`);
      await refreshBatch(batch.id);
      refreshBatches();
    } catch (actionError) { setError(actionError.message); }
    finally { setBusyId(null); }
  };

  const batchAction = async (verb) => {
    setBusyId(verb);
    setError("");
    try {
      const result = await api(`${API}/${batch.id}/${verb}`, { method: "POST" });
      if (verb === "import-analyzed") {
        (result.records || []).forEach(addImportedItem);
        setNotice(`${result.importadas} importadas${result.saltadas ? `, ${result.saltadas} con duplicado pendiente de decisión` : ""}.`);
      }
      await refreshBatch(batch.id);
      refreshBatches();
    } catch (actionError) { setError(actionError.message); }
    finally { setBusyId(null); }
  };

  const copyPrompt = async () => {
    setError("");
    try {
      const { prompt, count } = await api(`${API}/${batch.id}/prompt`);
      if (!count) { setNotice("No hay imágenes pendientes de análisis."); return; }
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      setNotice(`Prompt de ${count} ${count === 1 ? "imagen" : "imágenes"} copiado. Pegalo en Claude Code y traé el JSON de vuelta.`);
    } catch (copyError) { setError(copyError.message); }
  };

  const applyResults = async () => {
    setBusyId("results");
    setError("");
    try {
      const result = await api(`${API}/${batch.id}/results`, { method: "POST", body: JSON.stringify({ text: pasteText }) });
      const parts = [`${result.aplicadas} fichas completadas`];
      if (result.sinCoincidencia.length) parts.push(`${result.sinCoincidencia.length} sin coincidencia (${result.sinCoincidencia.slice(0, 3).join(", ")}${result.sinCoincidencia.length > 3 ? "…" : ""})`);
      if (result.errores.length) parts.push(result.errores[0]);
      setNotice(parts.join(" · "));
      if (result.aplicadas) { setPasteText(""); setPasteOpen(false); }
      setBatch({ ...result.batch, quotaExhausted: batch.quotaExhausted });
      refreshBatches();
    } catch (applyError) { setError(applyError.message); }
    finally { setBusyId(null); }
  };

  const visibleItems = useMemo(() => {
    if (!batch) return [];
    return batch.items.filter((item) => (tab === "descartadas" ? item.estado === "descartada" : item.estado !== "descartada"));
  }, [batch, tab]);

  const pendingCount = batch ? batch.items.filter((item) => ["pendiente", "error"].includes(item.estado)).length : 0;
  const analyzedCount = batch ? batch.items.filter((item) => item.estado === "analizada" && !item.duplicateOf).length : 0;
  const errorCount = batch ? batch.items.filter((item) => item.estado === "error").length : 0;
  const discardedCount = batch ? batch.items.filter((item) => item.estado === "descartada").length : 0;

  return (
    <section
      className={`bi-panel${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <input ref={folderInput} type="file" webkitdirectory="" hidden onChange={onPickFolder} />
      <input ref={filesInput} type="file" accept=".jpg,.jpeg,.png,.webp,.zip" multiple hidden onChange={onPickFiles} />

      <header className="bi-head">
        <div>
          {batch ? (
            <button className="bi-back" type="button" onClick={() => { setActiveId(null); refreshBatches(); }}><ArrowLeft size={15} /> Lotes</button>
          ) : (
            <button className="bi-back" type="button" onClick={onBack}><ArrowLeft size={15} /> Catálogo</button>
          )}
          <h2>{batch ? batch.name : "Importar por carpetas"}</h2>
          {batch && (
            <p className="bi-counters">
              {batch.counters.pendientes} pendientes · {batch.counters.analizadas} analizadas · {batch.counters.aprobadas} aprobadas · {batch.counters.descartadas} descartadas · {batch.counters.errores} con error
            </p>
          )}
        </div>
        <div className="bi-head-actions">
          <button className="bi-button" type="button" onClick={() => folderInput.current?.click()}><FolderOpen size={15} /> Elegir carpeta</button>
          <button className="bi-button" type="button" onClick={() => filesInput.current?.click()}><UploadSimple size={15} /> Archivos o ZIP</button>
        </div>
      </header>

      {config?.quotaExhausted && (
        <div className="bi-banner bi-banner--cuota" role="alert">
          <WarningCircle size={16} /> API de Gemini sin cuota disponible — revisá tu plan. Las imágenes quedaron pendientes para reintentar.
        </div>
      )}
      {upload && (
        <div className="bi-progress">
          <div className="bi-progress-meta"><span>Subiendo imágenes…</span><span>{upload.done} / {upload.total}</span></div>
          <div className="bi-progress-track"><div style={{ width: `${(upload.done / Math.max(1, upload.total)) * 100}%` }} /></div>
        </div>
      )}
      {(notice || error) && (
        <div className={`bi-notice${error ? " is-error" : ""}`} role="status">
          {error || notice}
          <button type="button" onClick={() => { setNotice(""); setError(""); }} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {!batch ? (
        <>
          <button className="bi-dropzone" type="button" onClick={() => folderInput.current?.click()}>
            <UploadSimple size={30} weight="light" />
            <strong>Arrastrá una carpeta, fotos sueltas o un ZIP</strong>
            <span>Cada carpeta crea un lote. Formatos: jpg, jpeg, png, webp. Nada entra al catálogo sin tu aprobación.</span>
          </button>
          {batches.length > 0 && (
            <div className="bi-batch-list">
              {batches.map((entry) => (
                <button className="bi-batch-row" type="button" key={entry.id} onClick={() => setActiveId(entry.id)}>
                  <FolderOpen size={18} />
                  <span className="bi-batch-name">{entry.name}</span>
                  <span className="bi-batch-date">{new Date(entry.createdAt).toLocaleDateString("es")}</span>
                  <span className="bi-batch-counts">
                    {entry.counters.pendientes} pend. · {entry.counters.analizadas} analiz. · {entry.counters.aprobadas} aprob. · {entry.counters.descartadas} desc. · {entry.counters.errores} err.
                  </span>
                  <CaretRight size={15} />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bi-toolbar">
            <div className="bi-tabs">
              <button type="button" className={tab === "activas" ? "active" : ""} onClick={() => setTab("activas")}>Activas</button>
              <button type="button" className={tab === "descartadas" ? "active" : ""} onClick={() => setTab("descartadas")}>Descartadas{discardedCount ? ` (${discardedCount})` : ""}</button>
            </div>
            <div className="bi-toolbar-actions">
              {config && !config.auto ? (
                <>
                  <button className="bi-button" type="button" disabled={!pendingCount} onClick={copyPrompt}>
                    {copied ? <Check size={14} weight="bold" /> : <CopySimple size={14} />} Copiar prompt de análisis{pendingCount ? ` (${pendingCount})` : ""}
                  </button>
                  <button className="bi-button" type="button" onClick={() => setPasteOpen((open) => !open)}><ClipboardText size={14} /> Pegar resultado JSON</button>
                </>
              ) : (
                <button className="bi-button" type="button" disabled={!pendingCount || analyzing || busyId === "analyze"} onClick={() => batchAction("analyze")}>
                  {analyzing ? <SpinnerGap className="spin" size={14} /> : null} Analizar pendientes{pendingCount ? ` (${pendingCount})` : ""}
                </button>
              )}
              <button className="bi-button" type="button" disabled={!analyzedCount || busyId === "import-analyzed"} onClick={() => batchAction("import-analyzed")}>
                <Check size={14} /> Importar todas las analizadas{analyzedCount ? ` (${analyzedCount})` : ""}
              </button>
              {errorCount > 0 && (
                <button className="bi-button" type="button" disabled={busyId === "retry-errors"} onClick={() => batchAction("retry-errors")}>
                  <ArrowCounterClockwise size={14} /> Reintentar errores ({errorCount})
                </button>
              )}
              <button className="bi-button bi-button--danger" type="button" disabled={busyId === "discard-all"} onClick={() => window.confirm("¿Descartar todas las prendas no importadas del lote?") && batchAction("discard-all")}>
                <Trash size={14} /> Descartar todas
              </button>
            </div>
          </div>

          {pasteOpen && config && !config.auto && (
            <div className="bi-paste">
              <label htmlFor="bi-paste-text">Pegá el JSON devuelto por Claude Code (un objeto o un array con varias imágenes; se matchea por nombre de archivo).</label>
              <textarea id="bi-paste-text" rows="6" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder='[{ "archivo": "blue-jeans.jpg", "nombre": "Jean recto azul", "categoria": "bottoms", ... }]' />
              <div>
                <button className="bi-button bi-button--primary" type="button" disabled={!pasteText.trim() || busyId === "results"} onClick={applyResults}>
                  {busyId === "results" ? <SpinnerGap className="spin" size={14} /> : <Check size={14} />} Aplicar resultados
                </button>
              </div>
            </div>
          )}

          {visibleItems.length ? (
            <div className="bi-grid">
              {visibleItems.map((item) => (
                <ItemCard key={item.id} item={item} batchId={batch.id} config={config} busy={busyId === item.id} onPatch={patchItem} onAction={itemAction} />
              ))}
            </div>
          ) : (
            <p className="bi-empty">{tab === "descartadas" ? "No hay prendas descartadas en este lote." : "Este lote no tiene imágenes todavía: arrastrá una carpeta o elegí archivos."}</p>
          )}
        </>
      )}

      {dragging && (
        <div className="bi-drop-overlay" aria-hidden="true">
          <UploadSimple size={36} weight="light" />
          <strong>Soltá para crear un lote</strong>
        </div>
      )}
    </section>
  );
}
