import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Evita inferência errada de “raiz” quando existe outro lockfile acima (ex.: na máquina do dev)
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
