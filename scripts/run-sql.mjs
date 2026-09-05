// Runs a .sql file against DATABASE_URL. Used by `npm run db:migrate` / `db:seed`.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — see .env.local.example");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

const sql = readFileSync(file, "utf8");

try {
  await pool.query(sql);
  console.log(`Ran ${file}`);
} finally {
  await pool.end();
}
