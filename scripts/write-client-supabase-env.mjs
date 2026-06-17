import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnv } from "vite";

const mode = process.argv[2] ?? process.env.NODE_ENV ?? "development";
const clientRoot = process.cwd();
const env = { ...loadEnv(mode, clientRoot, ""), ...process.env };

function pick(keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

const outputPath = path.join(clientRoot, ".env.local");
const fileContents = [
  `VITE_SUPABASE_URL=${pick(["VITE_SUPABASE_URL", "SUPABASE_URL"])}`,
  `VITE_SUPABASE_ANON_KEY=${pick(["VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"])}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${pick(["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"])}`,
  "",
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, fileContents, "utf8");

console.log(`Wrote ${outputPath}`);
