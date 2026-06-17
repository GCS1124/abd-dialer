import { access, cp, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "client", "dist");
const targetDir = path.join(rootDir, "dist");

try {
  await access(sourceDir);
} catch {
  throw new Error(`Missing build output at ${sourceDir}. Run the client build first.`);
}

await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`Copied ${sourceDir} to ${targetDir}`);
