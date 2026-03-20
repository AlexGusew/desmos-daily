import "dotenv/config";
import { pool } from "../db.js";

const START_DATE = "2026-03-01T00:00:00.000Z";
const CHALLENGE_COUNT = 50;

type SeedChallenge = {
  date: string;
  targetExpressions: string[];
  graphData: {
    xRange: [number, number];
    yRange: [number, number];
  };
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createChallenge(index: number): SeedChallenge {
  const dayOffset = index + 1;
  const slope = (index % 5) + 1;
  const intercept = (index % 9) - 4;
  const waveAmplitude = (index % 4) + 1;
  const xMin = -10 - (index % 3);
  const xMax = 10 + (index % 3);
  const yMin = -10 - (index % 4);
  const yMax = 10 + (index % 4);
  const date = new Date(START_DATE);
  date.setUTCDate(date.getUTCDate() + index);

  return {
    date: formatDate(date),
    targetExpressions: [
      `y=${slope}x${intercept >= 0 ? `+${intercept}` : intercept}`,
      `y=${waveAmplitude}\\sin(x/${dayOffset})`,
    ],
    graphData: {
      xRange: [xMin, xMax],
      yRange: [yMin, yMax],
    },
  };
}

function buildSeedChallenges(): SeedChallenge[] {
  return Array.from({ length: CHALLENGE_COUNT }, (_, index) =>
    createChallenge(index)
  );
}

async function ensureUniqueDateConstraint(): Promise<string | null> {
  const [indexes] = await pool.query<any[]>("SHOW INDEX FROM challenges WHERE Column_name = 'date'");
  const hasUniqueDateIndex = indexes.some(
    (index) => index.Non_unique === 0 && index.Key_name !== "PRIMARY"
  );

  if (hasUniqueDateIndex) {
    return null;
  }

  const command =
    "ALTER TABLE challenges ADD UNIQUE KEY challenges_date_unique (date)";
  await pool.query(command);
  return command;
}

async function seedChallenges(): Promise<void> {
  const challenges = buildSeedChallenges();
  const addedUniqueConstraintCommand = await ensureUniqueDateConstraint();

  for (const challenge of challenges) {
    await pool.query(
      `
        INSERT INTO challenges (date, target_expressions, graph_data)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          target_expressions = VALUES(target_expressions),
          graph_data = VALUES(graph_data)
      `,
      [
        challenge.date,
        JSON.stringify(challenge.targetExpressions),
        JSON.stringify(challenge.graphData),
      ]
    );
  }

  console.log(
    JSON.stringify({
      seededCount: challenges.length,
      startDate: challenges[0]?.date ?? null,
      endDate: challenges[challenges.length - 1]?.date ?? null,
      includesToday:
        challenges.some((challenge) => challenge.date === "2026-03-20"),
      uniqueDateConstraintCommand: addedUniqueConstraintCommand,
    })
  );
}

seedChallenges()
  .catch((error) => {
    console.error("Failed to seed challenges", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
