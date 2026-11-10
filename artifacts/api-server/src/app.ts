import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { tryonRouter } from "./tryon";
import { embedRouter } from "./embed";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Antes de express.json(): los handlers del vestidor leen el body crudo del
// stream, igual que cuando corren como middlewares de Vite.
// Widget para Odoo (y CORS del modo directo) antes que el vestidor: el
// preflight OPTIONS tiene que responderse antes de llegar a los handlers.
app.use(embedRouter());
app.use(tryonRouter());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
