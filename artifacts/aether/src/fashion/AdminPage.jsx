import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FolderOpen, LockKey, SignOut, SpinnerGap } from "@phosphor-icons/react";
import { useCatalog } from "./catalog-context.jsx";
import { ItemViewer } from "./ItemViewer.jsx";
import { BatchImportPanel } from "./batch-import.jsx";
import "./styles.css";
import "./shop.css";

const KEY_STORAGE = "fm-admin-key-v1";

// Clave simple del panel (configurable con VITE_ADMIN_KEY).
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || "fw2026";

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
  const { items, loading, error: catalogError, saveItem, deleteItem, refreshCatalog } = useCatalog();
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || "");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("catalog");
  const [actionError, setActionError] = useState("");

  const visibleItems = useMemo(() => {
    const filtered = category === "all" ? items : items.filter((item) => item.part === category);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [items, category]);

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
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><span>FASHION MARKET</span><small>Administración</small></button>
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
            <button className="retail-primary-button admin-import" type="button" onClick={() => setView("import")}>
              <FolderOpen size={16} /> Importar por carpetas
            </button>
          </div>
          {loading ? <p className="status"><SpinnerGap className="spin" size={16} /> Cargando catálogo…</p> : (
            <div className="admin-grid">
              {visibleItems.map((item) => (
                <button className="admin-grid-item" type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
                  <img src={item.thumbnail || item.image} alt="" loading="lazy" />
                  <span>{item.name}</span>
                </button>
              ))}
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
