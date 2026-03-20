import "dotenv/config";
import express from "express";
import cors from "cors";
import challengesRouter from "./routes/challenges.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/challenges", challengesRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
