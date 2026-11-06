import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeSlash, FolderOpen, LockKey, SignOut, SpinnerGap } from "@phosphor-icons/react";
import { isActiveItem, useCatalog } from "./catalog-context.jsx";
import { BrandLogo } from "./BrandLogo.jsx";
import { ItemViewer } from "./ItemViewer.jsx";
import { BatchImportPanel } from "./batch-import.jsx";
import "./styles.css";
import "./shop.css";

const KEY_STORAGE = "fm-admin-key-v1";

// Clave del panel: se configura con VITE_ADMIN_KEY (.env local, Secret en el deploy).
// A propósito no hay clave por defecto: sin la variable el panel queda cerrado.
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || "";

const ADMIN_TABS = [
  ["all", "Todo"],
  ["upperbody", "Superiores"],
  ["wholebody", "Vestidos y enterizos"],
  ["wholebody_up", "Abrigos"],
  ["lowerbody", "Inferiores"],
  ["accessories_up", "Accesorios"],
  ["shoes", "Calzado"],
];

function AdminLogin({ onAuthed }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!ADMIN_KEY) {
      setError("El panel no tiene clave configurada (falta VITE_ADMIN_KEY).");
      return;
    }
    if (key !== ADMIN_KEY) {
      setError("Clave incorrecta.");
      return;
    }
    sessionStorage.setItem(KEY_STORAGE, key);
    onAuthed(key);
  };

  return (
    <div className="admin-login">
      <form onSubmit={submit}>
        <LockKey size={30} />
        <h1>Panel de administración</h1>
        <p>Ingresá la clave para administrar el catálogo.</p>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="Clave de administración"
          aria-label="Clave de administración"
          autoFocus
        />
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button className="retail-primary-button" type="submit" disabled={!key}>Entrar</button>
      </form>
    </div>
  );
}

export function AdminPage() {
  const [, navigate] = useLocation();
  const { allItems: items, setItemsActive, loading, error: catalogError, saveItem, deleteItem, refreshCatalog } = useCatalog();
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || "");
  const [category, setCategory] = useState("all");
  const [collection, setCollection] = useState("all");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("catalog");
  const [actionError, setActionError] = useState("");

  const collections = useMemo(
    () => [...new Set(items.map((item) => item.collection).filter(Boolean))].sort().reverse(),
    [items],
  );

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) =>
      (category === "all" || item.part === category)
      && (collection === "all" || item.collection === collection));
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [items, category, collection]);

  const toggleActive = async (ids, active) => {
    setBusy(true);
    setActionError("");
    try {
      await setItemsActive(ids, active);
    } catch (toggleError) {
      setActionError(toggleError.message);
    } finally {
      setBusy(false);
    }
  };

  const collectionIds = visibleItems.map((item) => item.id);
  const collectionActive = visibleItems.some(isActiveItem);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const removeItem = async (id) => {
    try {
      await deleteItem(id);
      setSelectedId(null);
    } catch (deleteError) {
      setActionError(deleteError.message);
    }
  };

  if (!adminKey || adminKey !== ADMIN_KEY) return <AdminLogin onAuthed={setAdminKey} />;

  return (
    <div className="app-shell retail-wardrobe admin-page">
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><BrandLogo subtitle="Administración" /><small>Administración</small></button>
        <p>Catálogo</p>
        <div className="topbar-actions">
          <button
            className="retail-outline-button"
            type="button"
            onClick={() => { sessionStorage.removeItem(KEY_STORAGE); setAdminKey(""); }}
          ><SignOut size={16} /> Salir</button>
        </div>
      </header>

      {(catalogError || actionError) && <p className="status error">{catalogError || actionError}</p>}

      {view === "import" ? (
        <BatchImportPanel onBack={() => setView("catalog")} />
      ) : (
        <main className="admin-catalog">
          <div className="admin-catalog-tools">
            <div className="builder-filter-chips">
              {ADMIN_TABS.map(([id, label]) => (
                <button key={id} type="button" className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{label}</button>
              ))}
            </div>
            <div className="builder-filter-chips">
              <button type="button" className={collection === "all" ? "active" : ""} onClick={() => setCollection("all")}>Todas las colecciones</button>
              {collections.map((name) => {
                const count = items.filter((item) => item.collection === name);
                const active = count.filter(isActiveItem).length;
                return (
                  <button key={name} type="button" className={collection === name ? "active" : ""} onClick={() => setCollection(name)}>
                    {name} · {active ? `${active}/${count.length} activas` : "inactiva"}
                  </button>
                );
              })}
            </div>
            {collection !== "all" && visibleItems.length > 0 && (
              <button className="retail-outline-button" type="button" disabled={busy} onClick={() => toggleActive(collectionIds, !collectionActive)}>
                {collectionActive ? <><EyeSlash size={16} /> Desactivar {collection}</> : <><Eye size={16} /> Activar {collection}</>}
              </button>
            )}
            <button className="retail-primary-button admin-import" type="button" onClick={() => setView("import")}>
              <FolderOpen size={16} /> Importar por carpetas
            </button>
          </div>
          {loading ? <p className="status"><SpinnerGap className="spin" size={16} /> Cargando catálogo…</p> : (
            <div className="admin-grid">
              {visibleItems.map((item) => {
                const active = isActiveItem(item);
                return (
                  <div className={`admin-grid-item${active ? "" : " is-inactive"}`} key={item.id}>
                    <button className="admin-grid-open" type="button" onClick={() => setSelectedId(item.id)}>
                      <img src={item.thumbnail || item.image} alt="" loading="lazy" />
                      <span>{item.name}</span>
                    </button>
                    <div className="admin-grid-status">
                      <small>{item.collection || "Sin colección"} · {active ? "Activa" : "Inactiva"}</small>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleActive([item.id], !active)}
                        aria-label={active ? `Desactivar ${item.name}` : `Activar ${item.name}`}
                        title={active ? "Ocultar de la tienda" : "Mostrar en la tienda"}
                      >{active ? <Eye size={15} /> : <EyeSlash size={15} />}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {selectedItem && (
        <ItemViewer
          item={selectedItem}
          modelImage={null}
          onClose={() => setSelectedId(null)}
          onSave={saveItem}
          onDelete={removeItem}
          onRegenerationApproved={refreshCatalog}
        />
      )}
    </div>
  );
}
