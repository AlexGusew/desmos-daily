import "dotenv/config";
import express from "express";
import cors from "cors";
import challengesRouter from "./routes/challenges.js";
import { pool } from "./db.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({ origin: /\.desmos\.com$/ }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/challenges", challengesRouter);

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
});
