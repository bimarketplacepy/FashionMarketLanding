// Persistencia del probador virtual en producción.
//
// En el workspace (dev) el vestidor sigue guardando en archivos JSON bajo
// artifacts/aether/data/, que se commitean y viajan al deployment como semilla
// de sólo lectura. En autoscale el disco es efímero y no se comparte entre
// instancias, así que todo lo que el probador escribe en runtime se guarda acá.
//
// Las tablas guardan el mismo shape que los archivos JSON para que el handler
// del vestidor sea idéntico en ambos modos: el store de Postgres se superpone a
// la semilla en vez de reemplazarla.

import { pgTable, text, jsonb, timestamp, customType, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Todo se guarda por sesión anónima: el probador no tiene login, pero dos
// visitantes simultáneos no pueden pisarse el avatar ni verse los looks. La
// sesión es un uuid en la cookie httpOnly `fm_sid` (30 días), que emite
// artifacts/api-server/src/tryon/session.ts.

// Avatar elegido por una sesión. Una fila por visitante; sin fila = visitante
// nuevo, y el probador lo manda a elegir modelo.
export const tryonModelProfileTable = pgTable("tryon_model_profile", {
  sessionId: text("session_id").primaryKey(),
  profile: jsonb("profile").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Un look guardado. `outfit` es el objeto completo tal cual lo devuelve la API,
// para no duplicar la validación que ya hace el handler.
export const tryonOutfitsTable = pgTable(
  "tryon_outfits",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    outfit: jsonb("outfit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tryon_outfits_session_idx").on(table.sessionId)],
);

// Fotografía generada de un look. Se guarda el PNG completo porque el disco del
// deployment no sobrevive un redeploy. Lleva sesión para que la lectura se pueda
// filtrar por dueño y no alcance con adivinar el nombre del archivo.
export const tryonOutfitImagesTable = pgTable(
  "tryon_outfit_images",
  {
    filename: text("filename").primaryKey(),
    sessionId: text("session_id").notNull(),
    contentType: text("content_type").notNull().default("image/png"),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tryon_outfit_images_session_idx").on(table.sessionId)],
);

export const insertTryonModelProfileSchema = createInsertSchema(tryonModelProfileTable);
export type InsertTryonModelProfile = z.infer<typeof insertTryonModelProfileSchema>;
export type TryonModelProfile = typeof tryonModelProfileTable.$inferSelect;

export const insertTryonOutfitSchema = createInsertSchema(tryonOutfitsTable);
export type InsertTryonOutfit = z.infer<typeof insertTryonOutfitSchema>;
export type TryonOutfit = typeof tryonOutfitsTable.$inferSelect;

export type TryonOutfitImage = typeof tryonOutfitImagesTable.$inferSelect;
