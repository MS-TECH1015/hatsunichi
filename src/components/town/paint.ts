// 地面と看板に貼る絵。canvas に描いて three.js のテクスチャにする。写真や他所の絵は使わない
import * as THREE from "three";

const INK = "#2b2622";
const PAPER = "#fffaf0";
const GREEN = "#3c6b55";
const FONT = "system-ui, 'Hiragino Maru Gothic ProN', 'Zen Maru Gothic', sans-serif";

/** tiled は地面のように繰り返す絵。そうでない絵は Blender の板の UV に合わせて上下を返さない */
function make(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, tiled = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (tiled) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  else tex.flipY = false;
  return tex;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 地の色に、小さな点をばらまく */
function grain(g: CanvasRenderingContext2D, w: number, h: number, base: string, dots: string[], count: number, size: number, seed: number) {
  const r = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = dots[i % dots.length];
    g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

/** 石やタイルを並べる。row ごとに offset ずらす */
function tiles(g: CanvasRenderingContext2D, w: number, h: number, tw: number, th: number, colors: string[], grout: string, offset: number, seed: number) {
  const r = seeded(seed);
  g.fillStyle = grout;
  g.fillRect(0, 0, w, h);
  for (let row = 0; row * th < h; row++) {
    const shift = (row % 2) * offset;
    for (let x = -tw; x < w + tw; x += tw) {
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.fillRect(x + shift + 2, row * th + 2, tw - 3, th - 3);
    }
  }
}

export const paving = {
  asphalt: () => make(256, 256, (g) => grain(g, 256, 256, "#6c7076", ["#62666c", "#7a7e84", "#5a5e63", "#868a8f"], 2600, 2.2, 1)),
  /** 町の外の道。横が道幅で、両端に白線、真ん中に 1.2 ずつの破線 */
  road: () =>
    make(128, 256, (g) => {
      grain(g, 128, 256, "#6c7076", ["#62666c", "#7a7e84", "#5a5e63"], 900, 2, 2);
      g.fillStyle = "#f2efe6";
      g.fillRect(8, 0, 5, 256);
      g.fillRect(115, 0, 5, 256);
      g.fillRect(61, 0, 6, 128);
    }),
  sidewalk: () => make(256, 256, (g) => tiles(g, 256, 256, 64, 64, ["#d3d0c8", "#cbc8bf", "#d9d6cf", "#c6c3ba"], "#a9a69e", 0, 3)),
  plaza: () => make(256, 256, (g) => tiles(g, 256, 256, 64, 32, ["#e6d4b1", "#dcc7a2", "#ead9bb", "#d6bf98"], "#b9a888", 32, 4)),
  gravel: () => make(256, 256, (g) => grain(g, 256, 256, "#c9ba98", ["#b3a37f", "#dacdb0", "#a39573", "#e4d9bf"], 3200, 2.6, 5)),
  boardwalk: () =>
    make(256, 256, (g) => {
      const r = seeded(6);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ["#a9825a", "#9c774f", "#b48c62", "#a07a52"][i % 4];
        g.fillRect(0, i * 32, 256, 32);
        g.fillStyle = "#6b4d33";
        g.fillRect(0, i * 32, 256, 2);
        for (const x of [20 + r() * 10, 226 - r() * 10]) g.fillRect(x, i * 32 + 14, 3, 3);
      }
    }),
  line: () => make(4, 4, (g) => ((g.fillStyle = "#f4f2ea"), g.fillRect(0, 0, 4, 4))),
  /** 川。流れに沿った白い筋。offset を動かして流す */
  river: () =>
    make(64, 256, (g) => {
      const r = seeded(7);
      g.fillStyle = "#68afd8";
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = "#4f93bd";
      g.fillRect(0, 0, 7, 256);
      g.fillRect(57, 0, 7, 256);
      g.fillStyle = "#a6d6ef";
      for (let i = 0; i < 18; i++) g.fillRect(10 + r() * 40, r() * 256, 2 + r() * 3, 18 + r() * 40);
    }),
};

/** バス停の丸い標識。外は透かす（alphaTest） */
export function busSign(): THREE.CanvasTexture {
  return make(
    256,
    256,
    (g) => {
      g.fillStyle = PAPER;
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = GREEN;
      g.lineWidth = 12;
      g.beginPath();
      g.arc(128, 128, 102, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = GREEN;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `900 80px ${FONT}`;
      g.fillText("バス", 128, 114);
      g.font = `800 34px ${FONT}`;
      g.fillText("のりば", 128, 178);
    },
    false,
  );
}

/** 標識の下の縦長の札。町の名前を縦に書く */
export function stopName(name: string): THREE.CanvasTexture {
  return make(
    128,
    320,
    (g) => {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 128, 320);
      g.strokeStyle = GREEN;
      g.lineWidth = 8;
      g.strokeRect(6, 6, 116, 308);
      g.fillStyle = INK;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const size = Math.min(70, 290 / name.length);
      g.font = `900 ${size}px ${FONT}`;
      [...name].forEach((ch, i) => g.fillText(ch, 64, 160 + (i - (name.length - 1) / 2) * size * 1.02));
    },
    false,
  );
}

/** バス停の屋根の前の帯 */
export function shelterName(name: string): THREE.CanvasTexture {
  return make(
    1024,
    102,
    (g) => {
      g.fillStyle = GREEN;
      g.fillRect(0, 0, 1024, 102);
      g.fillStyle = PAPER;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `800 58px ${FONT}`;
      g.fillText(`${name}　バス停`, 512, 54);
    },
    false,
  );
}

/** 駅舎の名前の板 */
export function stationSign(name: string): THREE.CanvasTexture {
  return make(
    1024,
    170,
    (g) => {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 1024, 170);
      g.fillStyle = GREEN;
      g.fillRect(0, 140, 1024, 30);
      g.fillStyle = INK;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `900 104px ${FONT}`;
      g.fillText(name, 512, 72);
    },
    false,
  );
}

/** 町の案内板。通りの十字と現在地だけの、絵の地図 */
export function guideMap(name: string, style: string): THREE.CanvasTexture {
  return make(
    512,
    320,
    (g) => {
      const r = seeded(name.length * 31 + style.length);
      g.fillStyle = style === "dune" ? "#efe2bf" : "#e9f0d8";
      g.fillRect(0, 0, 512, 320);
      if (style === "dune") {
        g.fillStyle = "#7cc0de";
        g.fillRect(0, 60, 512, 50);
      }
      g.fillStyle = "#b9d7a0";
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(r() * 512, 80 + r() * 240, 18 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#9a9ea4";
      if (style === "dune") g.fillRect(236, 190, 40, 130);
      else {
        g.fillRect(0, 186, 512, 28);
        g.fillRect(242, 60, 28, 260);
      }
      g.fillStyle = "#e0503c";
      g.beginPath();
      g.arc(188, 172, 14, 0, Math.PI * 2);
      g.fill();
      g.font = `800 22px ${FONT}`;
      g.fillStyle = INK;
      g.textBaseline = "middle";
      g.fillText("現在地", 208, 152);
      g.fillStyle = GREEN;
      g.fillRect(0, 0, 512, 56);
      g.fillStyle = PAPER;
      g.textAlign = "center";
      g.font = `900 34px ${FONT}`;
      g.fillText(`${name} 案内図`, 256, 30);
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.strokeRect(3, 3, 506, 314);
    },
    false,
  );
}
