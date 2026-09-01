import { env } from "@huggingface/transformers";
import fs from "fs";
import path from "path";

let cacheDirSet = false;

export function ensureModelCache(): string {
  if (!cacheDirSet) {
    const cacheDir = path.join(process.cwd(), "models");
    fs.mkdirSync(cacheDir, { recursive: true });
    // Keep downloaded models in the stable project models/ dir so they survive
    // npm installs instead of living inside node_modules.
    env.cacheDir = cacheDir;
    cacheDirSet = true;
  }
  return env.cacheDir as string;
}