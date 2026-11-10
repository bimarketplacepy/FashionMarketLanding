// Serializa las escrituras de data/library.json dentro del proceso.
//
// Varios plugins (import-job, batch-import, garment-regeneration) hacen
// leer → modificar → escribir sobre el mismo archivo. Sin un lock, dos pedidos
// concurrentes (por ejemplo "Desactivar SS26", que toca cientos de prendas) se
// pisan y gana la última escritura. La cola vive en globalThis para que la
// compartan todos los módulos cargados en el mismo proceso de Vite.
const KEY = Symbol.for("fashion-market.library-lock");
globalThis[KEY] ??= Promise.resolve();

export function withLibraryLock(task) {
  const run = globalThis[KEY].then(task, task);
  // La cola sigue aunque la tarea falle; el error lo recibe quien la pidió.
  globalThis[KEY] = run.catch(() => {});
  return run;
}
