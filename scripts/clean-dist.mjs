import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export async function cleanDistDirectory(projectRoot = process.cwd()) {
  const distDir = path.join(projectRoot, "dist");

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

async function main() {
  await cleanDistDirectory();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
