// Los backends del vestidor viven en artifacts/aether/scripts como JS sin tipos
// (código portado del proyecto original, igual que allowJs en el tsconfig de
// aether). Se declaran acá para poder montarlos desde Express sin convertirlos.

declare module "*/scripts/outfit-api.mjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  import type { TryonStore } from "./pgStore";

  export function createTryonHandler(options: {
    root: string;
    env?: Record<string, string | undefined>;
    store: TryonStore;
    // El handler le pasa la request tal cual la recibió; quien monta decide de
    // dónde sale la sesión (cookie en el deployment, fija en el workspace).
    resolveSession?: (req: IncomingMessage & { tryonSessionId?: string }) => string;
  }): (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => void | Promise<void>;
}

declare module "*/scripts/responsive-image-api.mjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export function createIpxHandler(options: {
    dirs: string[];
    maxAge?: number;
  }): (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

declare module "*/scripts/admin-auth.mjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export function createAdminHandler(options?: {
    env?: Record<string, string | undefined>;
    secure?: boolean;
  }): (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => void | Promise<void>;
}
