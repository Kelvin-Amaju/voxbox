import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["unenhanced-ponchoed-konnor.ngrok-free.dev", 
    "192.168.1.178:3000",
  ],
  // Keep transformers.js/onnx as native Node modules rather than bundling
  // the browser WASM build, which crashes inside the Next server process.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
