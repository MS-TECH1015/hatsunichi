// 地面・海・川・道の見た目。three.js の材質のシェーダに、模様と動きを足す
import * as THREE from "three";
import type { Ground } from "@/lib/world";
import { paving } from "./paint";

/** 波と川を動かす時計（秒）。TownScene が毎コマ進める */
export const clock = { value: 0 };

const SHORE_CELLS = 9; // 岸からこの格子数までを浅瀬の色にする

const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** 地面の細かい濃淡。砂（格子の印 16）には風の筋を付ける */
const TERRAIN = /* glsl */ `
vec2 gp = vWorld.xz;
vec4 info = texture2D(uGround, (gp - uGrid.xy) / uGrid.zw);
float n = vnoise(gp * 0.45) * 0.6 + vnoise(gp * 1.7) * 0.4;
diffuseColor.rgb *= 0.92 + 0.14 * n;
diffuseColor.rgb *= 1.0 - step(0.94, hash12(floor(gp * 5.0))) * 0.06;
float warp = vnoise(gp * 0.18) * 5.0 + vnoise(gp * 0.7) * 1.2;
float rip = sin(dot(gp, vec2(0.86, 0.51)) * 5.5 + warp);
vec3 sandy = diffuseColor.rgb * (0.95 + 0.07 * rip) + vec3(0.04, 0.035, 0.02) * smoothstep(0.75, 1.0, rip);
diffuseColor.rgb = mix(diffuseColor.rgb, sandy, info.r);
`;

/** 海と湖。岸に近いほど浅い色、岸の白い泡、寄せる波の線、光の粒 */
const WATER = /* glsl */ `
vec2 gp = vWorld.xz;
float shore = texture2D(uGround, (gp - uGrid.xy) / uGrid.zw).g;
float t = uTime;
vec3 col = mix(vec3(0.03, 0.20, 0.42), vec3(0.18, 0.60, 0.66), smoothstep(0.0, 0.9, shore));
float ripple = vnoise(gp * 0.9 + vec2(t * 0.25, t * 0.15)) * 0.5 + vnoise(gp * 2.3 - vec2(t * 0.2, -t * 0.3)) * 0.5;
col *= 0.92 + 0.16 * ripple;
float glint = smoothstep(0.80, 0.86, vnoise(gp * 1.6 + vec2(t * 0.4, t * 0.1))) * (1.0 - shore * 0.7);
float foam = smoothstep(-0.02, 0.0, shore - 0.88 - 0.05 * sin(t * 0.9 + vnoise(gp * 0.5) * 6.28));
float wave = (1.0 - smoothstep(0.0, 0.025, abs(shore - 0.70 - 0.08 * sin(t * 0.6 + gp.x * 0.05)))) * shore;
col = mix(col, vec3(0.92, 0.97, 1.0), clamp(foam * 0.9 + wave * 0.35 + glint * 0.6, 0.0, 1.0));
diffuseColor.rgb = col;
`;

/** 格子ごとの砂（r）と、岸からの近さ（g、岸で 1、沖で 0）。シェーダが位置から引く */
export function groundTexture(g: Ground): THREE.DataTexture {
  const { w, h, mask } = g;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] & 4 ? 1e9 : 0;
  const relax = (r: number, q: number, dr: number, dq: number, cost: number) => {
    const rr = r + dr;
    const qq = q + dq;
    if (rr < 0 || qq < 0 || rr >= h || qq >= w) return;
    const i = r * w + q;
    dist[i] = Math.min(dist[i], dist[rr * w + qq] + cost);
  };
  for (let r = 0; r < h; r++)
    for (let q = 0; q < w; q++) {
      relax(r, q, 0, -1, 1);
      relax(r, q, -1, 0, 1);
      relax(r, q, -1, -1, Math.SQRT2);
      relax(r, q, -1, 1, Math.SQRT2);
    }
  for (let r = h - 1; r >= 0; r--)
    for (let q = w - 1; q >= 0; q--) {
      relax(r, q, 0, 1, 1);
      relax(r, q, 1, 0, 1);
      relax(r, q, 1, 1, Math.SQRT2);
      relax(r, q, 1, -1, Math.SQRT2);
    }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = mask[i] & 16 ? 255 : 0;
    data[i * 4 + 1] = Math.round(255 * Math.max(0, 1 - dist[i] / SHORE_CELLS));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 材質のシェーダに、世界座標と模様の式を差し込む */
function patch<T extends THREE.Material>(m: T, key: string, uniforms: Record<string, THREE.IUniform>, body: string): T {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\nuniform sampler2D uGround;\nuniform vec4 uGrid;\nuniform float uTime;\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${body}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export type Looks = Record<string, () => THREE.Material>;

/** city.glb の材質名ごとの見た目 */
export function cityLooks(g: Ground, gradientMap: THREE.Texture): { looks: Looks; flow: THREE.Texture } {
  const uniforms = {
    uGround: { value: groundTexture(g) },
    uGrid: { value: new THREE.Vector4(g.x0 - g.cell / 2, g.z0 - g.cell / 2, g.cell * g.w, g.cell * g.h) },
    uTime: clock,
  };
  const toon = (p: THREE.MeshToonMaterialParameters) => new THREE.MeshToonMaterial({ gradientMap, ...p });
  const flow = paving.river();
  const road = paving.road();
  return {
    flow,
    looks: {
      terrain: () => flat(patch(toon({ vertexColors: true }), "terrain", uniforms, TERRAIN)),
      skirt: () => flat(toon({ color: 0x8a6446 })),
      water: () => patch(toon({ color: 0xffffff }), "water", uniforms, WATER),
      water_side: () => flat(toon({ color: 0x2f6f9c })),
      river: () => overlay(toon({ map: flow })),
      road: () => overlay(toon({ map: road })),
    },
  };
}

/** 面ごとに陰を付ける。three.js は flatShading が true の材質を面の向きで塗る */
function flat<T extends THREE.Material>(m: T): T {
  (m as T & { flatShading: boolean }).flatShading = true;
  return m;
}

/** 川と道は地面に重ねて描くので、奥行きを少し手前にずらしてちらつきを防ぐ */
function overlay<T extends THREE.Material>(m: T): T {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return flat(m);
}
