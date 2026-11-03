// MapLibre の worker と、地形の glb を開く Draco の復号器を public/ に写す。npm install 後と build 前に走る
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
mkdirSync("public/draco", { recursive: true });
for (const f of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  copyFileSync(`node_modules/three/examples/jsm/libs/draco/gltf/${f}`, `public/draco/${f}`);
}
