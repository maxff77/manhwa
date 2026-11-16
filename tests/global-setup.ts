import { execFileSync } from "node:child_process";

export default function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL no configurada para los tests");
  }

  execFileSync("docker", ["compose", "up", "-d", "--wait", "db"], { stdio: "inherit" });

  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const username = decodeURIComponent(url.username);

  try {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        username,
        "-d",
        "postgres",
        "-c",
        `CREATE DATABASE "${databaseName}"`,
      ],
      { stdio: "pipe" },
    );
  } catch {
    // La base de test ya existe.
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
