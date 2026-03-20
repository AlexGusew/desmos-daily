import { Router } from "express";
import { pool } from "../db.js";
import type { Challenge } from "../types.js";
import type { RowDataPacket } from "mysql2";

const router = Router();

router.get("/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, date, target_expressions AS targetExpressions, graph_data AS graphData FROM challenges WHERE date = ?",
      [today]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "No challenge for today" });
      return;
    }

    const rawGraphData =
      typeof rows[0].graphData === "string"
        ? JSON.parse(rows[0].graphData)
        : rows[0].graphData ?? {};

    const rawExpressions =
      typeof rows[0].targetExpressions === "string"
        ? JSON.parse(rows[0].targetExpressions)
        : rows[0].targetExpressions;

    const challenge: Challenge = {
      id: rows[0].id,
      date: rows[0].date,
      targetExpressions: Array.isArray(rawExpressions)
        ? rawExpressions
        : [rawExpressions],
      graphData: rawGraphData,
    };

    res.json(challenge);
  } catch (err) {
    console.error("Failed to fetch today's challenge:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
