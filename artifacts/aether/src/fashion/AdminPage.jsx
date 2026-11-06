import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeSlash, FolderOpen, LockKey, SignOut, SpinnerGap } from "@phosphor-icons/react";
import { isActiveItem, useCatalog } from "./catalog-context.jsx";
import { BrandLogo } from "./BrandLogo.jsx";
import { ItemViewer } from "./ItemViewer.jsx";
import { BatchImportPanel } from "./batch-import.jsx";
import "./styles.css";
import "./shop.css";

// La clave del panel se valida en el servidor (ADMIN_KEY, nunca en el bundle):
// el login devuelve una cookie httpOnly de corta duración y las rutas de
// escritura del catálogo la exigen.
async function adminSession(method, body) {
  const response = await fetch("/api/admin/session", {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo validar la sesión.");
  return result;
}

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
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await adminSession("POST", { key });
      setKey("");
      onAuthed();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSending(false);
    }
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
        <button className="retail-primary-button" type="submit" disabled={!key || sending}>{sending ? "Validando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { allItems: items, setItemsActive, loading, error: catalogError, saveItem, deleteItem, refreshCatalog } = useCatalog();
  // null = verificando, false = sin sesión, true = sesión válida.
  const [authed, setAuthed] = useState(null);
  useEffect(() => {
    adminSession("GET").then((session) => setAuthed(Boolean(session.authenticated))).catch(() => setAuthed(false));
  }, []);
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

  if (authed === null) return <p className="status"><SpinnerGap className="spin" size={16} /> Verificando sesión…</p>;
  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;

  return (
    <div className="app-shell retail-wardrobe admin-page">
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><BrandLogo subtitle="Administración" /><small>Administración</small></button>
        <p>Catálogo</p>
        <div className="topbar-actions">
          <button
            className="retail-outline-button"
            type="button"
            onClick={() => { adminSession("DELETE").finally(() => setAuthed(false)); }}
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
