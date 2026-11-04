// three.js の鳥取市。Blender で作った地形（city.glb）に町の部品・木・家を並べ、主人公を歩かせ、斜め上からカメラが追う。
// 見た目はトゥーン（3段の陰）と輪郭線。React 側（Town.tsx）は onChange で時刻と話せる相手を受け取る
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { withBase } from "@/lib/base";
import {
  busMinutes,
  heightAt,
  nearestMark,
  nearestTarget,
  placeWorld,
  pushOut,
  routeBetween,
  stepWithin,
  targetAt,
  PROP_RADIUS,
  type Ground,
  type Mark,
  type Npc,
  type Placed,
  type Route,
  type Target,
  type Vec2,
  type World,
} from "@/lib/world";
import { Scatter } from "./scatter";
import { cityLooks, clock } from "./surfaces";
import { Towns, type TownData } from "./townMesh";

/** place はいま入っている町の名前。町の外とバスの中では null */
export type SceneState = { minutes: number; target: Target | null; place: string | null; mark: Mark | null };

type CityData = {
  grid: { x0: number; z0: number; cell: number; w: number; h: number };
  houses: [number, number, number, number][];
  trees: [number, number, number, number][];
  labels: { name: string; at: Vec2; kind: string }[];
  routes: Record<string, Route>;
  towns: Record<string, TownData>;
};
type Item = { x: number; z: number; rot: number; scale: number; tint?: (material: string) => THREE.Color | null };
type Walker = { obj: THREE.Object3D; npc: Npc; phase: number };
type Ride = { path: Vec2[]; lengths: number[]; total: number; t: number; heading: number; done: () => void };

const ACCENT = "#ffc23d";
const INK = "#2b2622";
const OUTLINE: [number, number, number] = [0.17, 0.14, 0.12];
const WALK_SPEED = 7; // 単位/秒。1 単位 = 50 m
const RUN_SPEED = 17; // Shift を押すか、同じ向きに歩き続けると走る
const RUN_AFTER = 1.2;
const CAMERA_OFFSET = new THREE.Vector3(0, 19, 16);
const RIDE_OFFSET = new THREE.Vector3(0, 52, 44);
const PEOPLE_SCALE = 1.35; // 人は建物より大きめにして、表情と動きを見せる
const LOOK_RANGE = 6; // 住民がこちらを向く距離
const BUS_SPEED = 9;
const RIDE_SECONDS = 7; // バスに乗っている長さ。遠くても近くてもこの秒数で着く
const CHUNK = 80; // 木と家を区切る大きさ。画面の外の区画は描かない
const NO_OUTLINE = { visible: false };
const ROOF_COLORS = [0x9e3826, 0x4d5770, 0x3f6b96, 0x74503a];
const PALE = new THREE.Color(0xeee8d6);
const FOG_PLAY: [number, number] = [110, 340];
const FOG_TITLE: [number, number] = [900, 2600];
const LABEL_HIDE = 60; // 歩いているとき、これより近い地名の札は隠す。町に入ると町名の帯が出る
const CORNER = 2.5; // バスが角を曲がるときの丸みの長さ

export class TownScene {
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private fog = new THREE.Fog(0xd8eef2, ...FOG_TITLE);
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private gradient = toonGradient();
  private toonCache = new Map<string, THREE.Material>();
  private models = new Map<string, THREE.Group>();
  private player = new THREE.Group();
  private playerPos: Vec2;
  private heading = 0;
  private runFor = 0;
  private keys = new Set<string>();
  private touchDir: Vec2 = [0, 0];
  private obstacles: { at: Vec2; radius: number }[] = [];
  private markers: THREE.Sprite[] = [];
  private labels: THREE.Sprite[] = [];
  private bubbles = new Map<string, THREE.Sprite>();
  private walkers: Walker[] = [];
  private clouds: THREE.Group[] = [];
  private ring: THREE.Mesh;
  private bus: THREE.Object3D | null = null;
  private busLine: Ride | null = null;
  private busState = { s: 0, dir: 1, wait: 0 };
  private rideBus: THREE.Object3D | null = null;
  private ride: Ride | null = null;
  private ground!: Ground;
  private city!: CityData;
  private center = new THREE.Vector3();
  private map: { canvas: HTMLCanvasElement; image: HTMLImageElement } | null = null;
  private answered = new Set<string>();
  /** 町丁の印の札と、手帳に入った印の id */
  private signs: THREE.Sprite[] = [];
  private found = new Set<string>();
  private lastMark: Mark | null = null;
  private minutes: number;
  private paused = true;
  private playing = false;
  private flyIn = 1;
  private flyFrom = new THREE.Vector3();
  private last = performance.now();
  private raf = 0;
  private lastTarget: Target | null = null;
  private world: Placed;
  private towns: Towns | null = null;
  private scatter: Scatter | null = null;
  private flow: THREE.Texture | null = null;
  private placeName: string | null = null;

  constructor(private canvas: HTMLCanvasElement, world: World, private onChange: (s: SceneState) => void) {
    this.world = placeWorld(world);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.effect = new OutlineEffect(this.renderer, { defaultThickness: 0.0032, defaultColor: OUTLINE });
    this.scene.background = skyTexture();
    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    this.playerPos = [...this.world.start] as Vec2;
    this.minutes = this.world.meta.clock.start_hour * 60;
    this.ring = this.makeRing();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  async start() {
    this.addLights();
    await this.loadCity();
    await Promise.all([this.loadModels(), this.loadTerrain()]);
    this.buildTowns();
    this.buildPlaces();
    this.buildForest();
    this.buildHouses();
    this.buildScatter();
    this.buildLabels();
    this.buildBus();
    this.buildPlayer();
    this.addClouds();
    this.last = performance.now();
    this.loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    this.renderer.dispose();
  }

  /** タイトルの空撮から、主人公の後ろへカメラが降りてくる */
  play() {
    this.flyFrom.copy(this.camera.position);
    this.flyIn = 0;
    this.playing = true;
  }

  /** 会話中は歩けない。閉じたら時刻を少し進める */
  setPaused(paused: boolean) {
    if (this.paused && !paused && this.playing && !this.ride) this.minutes += this.world.meta.clock.minutes_per_talk;
    this.paused = paused;
    this.keys.clear();
  }

  markAnswered(spotId: string) {
    this.answered.add(spotId);
    const m = this.markers.find((s) => s.userData.spotId === spotId);
    if (m) m.visible = false;
  }

  /** 手帳に入った印は札を薄くし、地図からも消す */
  setFound(markIds: string[]) {
    this.found = new Set(markIds);
    for (const s of this.signs) s.material.opacity = this.found.has(s.userData.markId) ? 0.35 : 1;
  }

  markTalked(npcId: string) {
    const b = this.bubbles.get(npcId);
    if (b) b.visible = false;
  }

  /** 話しかけた相手のほうへ向く */
  faceTo(at: Vec2) {
    this.heading = Math.atan2(at[0] - this.playerPos[0], at[1] - this.playerPos[1]);
    this.player.rotation.y = this.heading;
  }

  setTouchDir(dir: Vec2) {
    this.touchDir = dir;
  }

  /** 右上の小さな地図を描く先 */
  attachMap(canvas: HTMLCanvasElement | null) {
    if (!canvas) {
      this.map = null;
      return;
    }
    const image = new Image();
    image.src = withBase("/city/map.png");
    this.map = { canvas, image };
  }

  routeInfo(from: string, to: string): { km: number; minutes: number } | null {
    const r = routeBetween(this.city.routes, from, to);
    return r ? { km: r.km, minutes: busMinutes(r.km) } : null;
  }

  /** バスに乗って別の場所へ。着いたら resolve する。時計は距離に応じて進める */
  rideTo(from: string, to: string): Promise<void> {
    const r = routeBetween(this.city.routes, from, to);
    const dest = this.world.stops.find((s) => s.place.id === to);
    if (!r || !dest || !this.rideBus) return Promise.resolve();
    this.minutes += busMinutes(r.km);
    this.player.visible = false;
    this.rideBus.visible = true;
    return new Promise((resolve) => {
      this.ride = {
        ...measure(rounded(r.path)),
        t: 0,
        heading: 0,
        done: () => {
          this.playerPos = [dest.at[0] + 1.2, dest.at[1]]; // 標識の横の歩道
          this.heading = 0;
          this.player.rotation.y = 0;
          this.player.position.set(this.playerPos[0], this.groundY(this.playerPos), this.playerPos[1]);
          this.player.visible = true;
          this.rideBus!.visible = false;
          this.ride = null;
          resolve();
        },
      };
    });
  }

  /** 自動の通し確認と動画撮影用。?debug のときだけ window.__town から読む */
  get position(): Vec2 {
    return this.playerPos;
  }

  private resize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 縦長の画面では引いて、左右が切れすぎないようにする
    this.camera.fov = w < h ? 55 : 40;
    this.camera.updateProjectionMatrix();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.type === "keydown") this.keys.add(e.key.toLowerCase());
    else this.keys.delete(e.key.toLowerCase());
  };

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c49a, 1.3));
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -45;
    cam.right = cam.top = 45;
    cam.far = 300;
    cam.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);
  }

  /** 配置（city.json）と、足もとの高さ・歩ける所の格子（height.bin・mask.bin） */
  private async loadCity() {
    const [city, height, mask] = await Promise.all([
      fetch(withBase("/city/city.json")).then((r) => r.json() as Promise<CityData>),
      fetch(withBase("/city/height.bin")).then((r) => r.arrayBuffer()),
      fetch(withBase("/city/mask.bin")).then((r) => r.arrayBuffer()),
    ]);
    this.city = city;
    this.ground = { ...city.grid, height: new Int16Array(height), mask: new Uint8Array(mask) };
    const { x0, z0, cell, w, h } = city.grid;
    this.center.set(x0 + (w * cell) / 2, 0, z0 + (h * cell) / 2);
  }

  /** Blender で作った地形。色は頂点に入っている。模様と波は surfaces.ts のシェーダで足す */
  private async loadTerrain() {
    const draco = new DRACOLoader();
    draco.setDecoderPath(withBase("/draco/"));
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(withBase("/models/city.glb"));
    const { looks, flow } = cityLooks(this.ground, this.gradient);
    this.flow = flow;
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const name = (o.material as THREE.Material).name;
      o.material = (looks[name] ?? looks.terrain)();
      o.material.userData.outlineParameters = NO_OUTLINE;
      o.receiveShadow = true;
      o.geometry.computeVertexNormals();
    });
    this.scene.add(gltf.scene);
    draco.dispose();
  }

  private async loadModels() {
    const loader = new GLTFLoader();
    const kinds = new Set<string>(["person", "player", "rabbit", "bus", "tree_cone", "tree_round", "house_lo", "grass_tuft", "flower_tuft", "dune_grass"]);
    for (const p of this.world.props) kinds.add(p.kind);
    for (const t of Object.values(this.city.towns)) for (const p of t.props) kinds.add(p[0]);
    for (const s of this.world.spots) kinds.add(s.kind);
    await Promise.all(
      [...kinds].map(async (kind) => {
        const gltf = await loader.loadAsync(withBase(`/models/${kind}.glb`));
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => this.toon(m)) : this.toon(o.material);
          o.castShadow = kind !== "hill";
          o.receiveShadow = true;
        });
        this.models.set(kind, gltf.scene);
      }),
    );
  }

  /** glTF の材質を、色と名前を保ったままトゥーンに置き換える。同じ材質は使い回す */
  private toon(m: THREE.Material): THREE.Material {
    const cached = this.toonCache.get(m.uuid);
    if (cached) return cached;
    const src = m as THREE.MeshStandardMaterial;
    const t = new THREE.MeshToonMaterial({ color: src.color, gradientMap: this.gradient, name: src.name });
    this.toonCache.set(m.uuid, t);
    return t;
  }

  /** 足もとの高さ。町の中では歩道や舗装の厚みを足す */
  private groundY(at: Vec2) {
    return heightAt(this.ground, at[0], at[1]) + (this.towns?.liftAt(at[0], at[1]) ?? 0);
  }

  /** 町の通り・歩道・飾り（scripts/towns.py の配置）と、そのぶつかる円 */
  private buildTowns() {
    this.towns = new Towns(this.city.towns, this.world.places, (x, z) => heightAt(this.ground, x, z), this.models, this.gradient);
    this.scene.add(this.towns.group);
    this.obstacles.push(...this.towns.obstacles);
  }

  /** 足もとの草花。家や飾りのぶつかる円がそろってから作る */
  private buildScatter() {
    const towns = this.towns!;
    this.scatter = new Scatter(this.models, this.ground, this.obstacles, (x, z) => heightAt(this.ground, x, z), (x, z) => towns.liftAt(x, z) > 0);
    this.scene.add(this.scatter.group);
  }

  private place(kind: string, at: Vec2, face: number, scale = 1): THREE.Group {
    const base = this.models.get(kind);
    if (!base) throw new Error(`部品が無い: ${kind}`);
    const o = base.clone();
    o.position.set(at[0], this.groundY(at), at[1]);
    o.rotation.y = (face * Math.PI) / 2;
    o.scale.setScalar(scale);
    this.scene.add(o);
    return o;
  }

  /** 物語の目印の物・依頼の場所・住民。バス停は町の飾り（townMesh.ts）が置く */
  private buildPlaces() {
    for (const p of this.world.props) {
      this.place(p.kind, p.at, p.face, p.scale);
      const r = PROP_RADIUS[p.kind];
      if (r) this.obstacles.push({ at: p.at, radius: r * (p.scale ?? 1) });
    }
    for (const s of this.world.spots) {
      const o = this.place(s.kind, s.at, s.face);
      this.obstacles.push({ at: s.at, radius: s.radius });
      const top = new THREE.Box3().setFromObject(o).max.y;
      this.markers.push(this.addMarker(s.id, s.at, top + 1.6));
    }
    for (const m of this.world.marks) this.signs.push(this.addMarkSign(m));
    for (const n of this.world.npcs) {
      const o = this.place(n.kind, n.at, n.face, PEOPLE_SCALE);
      if (n.body) this.tint(o, "person_body", n.body);
      if (n.hair) this.tint(o, "person_hair", n.hair);
      this.obstacles.push({ at: n.at, radius: 0.8 });
      this.walkers.push({ obj: o, npc: n, phase: n.at[0] + n.at[1] });
      this.bubbles.set(n.id, this.addBubble(n.at, this.groundY(n.at) + (n.kind === "rabbit" ? 2.6 : 2.8)));
    }
  }

  /** 山の木。市の外の木は淡くして、歩ける範囲との境を見せる */
  private buildForest() {
    const rand = seeded(11);
    const items: Record<string, Item[]> = { tree_cone: [], tree_round: [] };
    for (const [x, z, scale, kind] of this.city.trees) {
      const outside = kind >= 2;
      const shade = 0.88 + rand() * 0.24;
      items[kind % 2 === 0 ? "tree_cone" : "tree_round"].push({
        x,
        z,
        scale,
        rot: rand() * Math.PI * 2,
        tint: (name) => {
          const base = this.materialColor(kind % 2 === 0 ? "tree_cone" : "tree_round", name);
          if (!base) return null;
          if (!outside) return new THREE.Color(shade, shade, shade);
          const pale = base.clone().lerp(PALE, 0.55);
          return new THREE.Color(pale.r / base.r, pale.g / base.g, pale.b / base.b);
        },
      });
    }
    for (const [kind, list] of Object.entries(items)) this.instanced(kind, list, false);
  }

  /** 町丁目ごとの人口に比例した数の家。実在の建物の位置ではない */
  private buildHouses() {
    const roofs = ROOF_COLORS.map((c) => new THREE.Color(c));
    const items: Item[] = this.city.houses.map(([x, z, face, roof]) => ({
      x,
      z,
      scale: 1,
      rot: (face * Math.PI) / 2,
      tint: (name) => (name === "roof" ? roofs[roof] : null),
    }));
    this.instanced("house_lo", items, true, { roof: 0xffffff });
    for (const it of items) this.obstacles.push({ at: [it.x, it.z], radius: 1.3 });
  }

  private materialColor(kind: string, name: string): THREE.Color | null {
    let found: THREE.Color | null = null;
    this.models.get(kind)?.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshToonMaterial).name === name) found = (o.material as THREE.MeshToonMaterial).color;
    });
    return found;
  }

  /**
   * 同じ部品を何千も置く。CHUNK ごとに分けた InstancedMesh にして、画面の外の区画は描かない。
   * white に名前のある材質は色を白にし、1つずつの色（tint）で塗る
   */
  private instanced(kind: string, items: Item[], castShadow: boolean, white: Record<string, number> = {}) {
    const base = this.models.get(kind);
    if (!base) return;
    base.updateMatrixWorld(true);
    const parts: { mesh: THREE.Mesh; local: THREE.Matrix4; material: THREE.MeshToonMaterial }[] = [];
    base.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let material = o.material as THREE.MeshToonMaterial;
      if (material.name in white) {
        material = material.clone();
        material.color.set(white[material.name]);
      }
      material.userData.outlineParameters = NO_OUTLINE;
      parts.push({ mesh: o, local: o.matrixWorld.clone(), material });
    });
    const chunks = new Map<string, Item[]>();
    for (const it of items) {
      const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
      chunks.set(key, [...(chunks.get(key) ?? []), it]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const plain = new THREE.Color(1, 1, 1);
    for (const list of chunks.values()) {
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.mesh.geometry, part.material, list.length);
        let tinted = false;
        list.forEach((it, i) => {
          p.set(it.x, heightAt(this.ground, it.x, it.z), it.z);
          q.setFromAxisAngle(up, it.rot);
          s.setScalar(it.scale);
          inst.setMatrixAt(i, m.compose(p, q, s).multiply(part.local));
          const c = it.tint?.(part.material.name) ?? null;
          if (c) tinted = true;
          inst.setColorAt(i, c ?? plain);
        });
        if (!tinted) inst.instanceColor = null;
        inst.castShadow = castShadow;
        inst.receiveShadow = true;
        inst.computeBoundingSphere();
        this.scene.add(inst);
      }
    }
  }

  /** 地名の札。地名と場所は位置参照情報・GTFS・国土数値情報から */
  private buildLabels() {
    for (const l of this.city.labels) {
      const style = l.kind === "town" ? { fill: "#fffaf0", color: INK, width: 64 * l.name.length + 80 } : { fill: "#2b2622", color: "#fffaf0", width: 64 * l.name.length + 80 };
      const sprite = this.textSprite(l.name, style);
      sprite.position.set(l.at[0], Math.max(this.groundY(l.at), 0) + 12, l.at[1]);
      sprite.scale.set(style.width / 22, 128 / 22, 1);
      sprite.material.depthTest = true;
      sprite.renderOrder = 5;
      this.labels.push(sprite);
    }
  }

  /** 駅と雲山のあいだを行き来するバス。乗るときは別の1台が走る */
  private buildBus() {
    const line = routeBetween(this.city.routes, "eki", "kumoyama");
    if (line) {
      this.busLine = { ...measure(rounded(line.path)), t: 0, heading: 0, done: () => {} };
      this.bus = this.place("bus", line.path[0], 0);
    }
    this.rideBus = this.place("bus", this.world.start, 0);
    this.rideBus.visible = false;
  }

  /** 胴や髪の色を役ごとに変える。名前の合う材質だけ差し替える */
  private tint(o: THREE.Object3D, name: string, rgb: [number, number, number]) {
    const replacement = toonMat(new THREE.Color(...rgb), this.gradient);
    replacement.name = name;
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return;
      if (Array.isArray(m.material)) m.material = m.material.map((x) => (x.name === name ? replacement : x));
      else if (m.material.name === name) m.material = replacement;
    });
  }

  /** 違和感の印。山吹の風船に「！」。遠くからも見えるよう、離れるほど大きくする */
  private addMarker(spotId: string, at: Vec2, height: number): THREE.Sprite {
    const sprite = this.sprite((g) => {
      g.fillStyle = ACCENT;
      g.strokeStyle = INK;
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(50, 98);
      g.lineTo(64, 122);
      g.lineTo(78, 98);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(64, 56, 46, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.font = "900 70px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", 64, 60);
    });
    sprite.position.set(at[0], height, at[1]);
    sprite.scale.setScalar(2.2);
    sprite.material.fog = false;
    sprite.userData = { spotId, baseY: height };
    return sprite;
  }

  /** 町丁の印の札。依頼の「!」より小さく、白地に「?」 */
  private addMarkSign(mark: Mark): THREE.Sprite {
    const sprite = this.sprite((g) => {
      g.fillStyle = "#fffaf0";
      g.strokeStyle = INK;
      g.lineWidth = 9;
      g.beginPath();
      g.arc(64, 64, 44, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.font = "900 60px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("?", 64, 68);
    });
    const height = this.groundY(mark.at) + 2.4;
    sprite.position.set(mark.at[0], height, mark.at[1]);
    sprite.scale.setScalar(1.4);
    sprite.material.fog = false;
    sprite.userData = { markId: mark.id, baseY: height, phase: mark.at[0] };
    return sprite;
  }

  /** まだ話していない住民の頭の上に出す吹き出し */
  private addBubble(at: Vec2, height: number): THREE.Sprite {
    const sprite = this.sprite((g) => {
      g.fillStyle = "#fffaf0";
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.beginPath();
      g.roundRect(14, 26, 100, 66, 30);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      for (const x of [42, 64, 86]) {
        g.beginPath();
        g.arc(x, 59, 7, 0, Math.PI * 2);
        g.fill();
      }
    });
    sprite.position.set(at[0], height, at[1]);
    sprite.scale.setScalar(1.1);
    sprite.userData = { baseY: height };
    return sprite;
  }

  private textSprite(text: string, style: { fill: string; color: string; width: number }): THREE.Sprite {
    return this.sprite(
      (g) => {
        g.fillStyle = style.fill;
        g.strokeStyle = INK;
        g.lineWidth = 8;
        g.beginPath();
        g.roundRect(6, 10, style.width - 12, 108, 54);
        g.fill();
        g.stroke();
        g.fillStyle = style.color;
        g.font = "900 64px 'Zen Maru Gothic', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, style.width / 2, 68);
      },
      style.width,
      128,
    );
  }

  private sprite(draw: (g: CanvasRenderingContext2D) => void, w = 128, h = 128): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    return sprite;
  }

  /** 話せる相手の足元に出す輪 */
  private makeRing(): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, depthWrite: false });
    mat.userData.outlineParameters = NO_OUTLINE;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    return ring;
  }

  private buildPlayer() {
    this.player.add(this.models.get("player")!.clone());
    this.player.scale.setScalar(PEOPLE_SCALE);
    this.scene.add(this.player);
    this.player.position.set(this.playerPos[0], this.groundY(this.playerPos), this.playerPos[1]);
  }

  /** タイトルの空撮でだけ見える高さに雲を浮かべる */
  private addClouds() {
    const white = toonMat(0xffffff, this.gradient, false);
    const rand = seeded(5);
    const { x0, z0, cell, w, h } = this.city.grid;
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      for (const [dx, dy, r] of [[0, 0, 6], [6, -1, 4.5], [-6, -1.5, 4], [2, 3, 4]]) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), white);
        puff.position.set(dx, dy, 0);
        cloud.add(puff);
      }
      const x = x0 + rand() * w * cell;
      cloud.position.set(x, 90 + rand() * 50, z0 + rand() * h * cell);
      cloud.scale.setScalar(2.5 + rand() * 2);
      cloud.userData.baseX = x;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private inputDir(): Vec2 {
    let x = this.touchDir[0];
    let z = this.touchDir[1];
    if (this.keys.has("arrowleft") || this.keys.has("a")) x -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) x += 1;
    if (this.keys.has("arrowup") || this.keys.has("w")) z -= 1;
    if (this.keys.has("arrowdown") || this.keys.has("s")) z += 1;
    const len = Math.hypot(x, z);
    return len > 1 ? [x / len, z / len] : [x, z];
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    clock.value = now / 1000;
    if (this.flow) this.flow.offset.y = -clock.value * 0.25;

    if (this.ride) this.driveRide(dt);
    else if (this.playing && !this.paused) this.walk(dt, now);
    this.animateTown(dt, now);
    this.moveCamera(dt, now);
    this.effect.render(this.scene, this.camera);
    if (this.playing) this.report(now, dt);
    this.drawMap(now);
  };

  private walk(dt: number, now: number) {
    this.minutes += dt * this.world.meta.clock.minutes_per_second;
    const [dx, dz] = this.inputDir();
    const body = this.player.children[0];
    if (dx === 0 && dz === 0) {
      this.runFor = 0;
      body.position.y = 0;
      body.rotation.z = 0;
      body.scale.set(1, 1 + Math.sin(now / 500) * 0.015, 1);
      return;
    }
    this.runFor += dt;
    const running = this.keys.has("shift") || this.runFor > RUN_AFTER;
    const speed = running ? RUN_SPEED : WALK_SPEED;
    const next: Vec2 = [this.playerPos[0] + dx * speed * dt, this.playerPos[1] + dz * speed * dt];
    this.playerPos = stepWithin(this.ground, this.playerPos, pushOut(next, this.obstacles));
    this.heading = turnToward(this.heading, Math.atan2(dx, dz), dt * 12);
    this.player.rotation.y = this.heading;
    const step = Math.sin(now / (running ? 55 : 75));
    body.position.y = Math.abs(step) * (running ? 0.22 : 0.14);
    body.scale.set(1 + Math.abs(step) * 0.04, 1 - Math.abs(step) * 0.04, 1);
    body.rotation.z = step * 0.06;
    body.rotation.x = running ? 0.18 : 0;
    const y = THREE.MathUtils.damp(this.player.position.y, this.groundY(this.playerPos), 20, dt); // 歩道の段差をなめらかに
    this.player.position.set(this.playerPos[0], y, this.playerPos[1]);
  }

  /** 乗ったバスを道に沿って走らせる */
  private driveRide(dt: number) {
    const r = this.ride!;
    r.t = Math.min(r.total, r.t + (r.total / RIDE_SECONDS) * dt);
    this.follow(this.rideBus!, r, dt);
    if (r.t >= r.total) r.done();
  }

  private follow(obj: THREE.Object3D, r: Ride, dt: number) {
    const [pos, dir] = pointAt(r, r.t);
    obj.position.set(pos[0], this.groundY(pos), pos[1]);
    r.heading = turnToward(r.heading, Math.atan2(dir[0], dir[1]) - Math.PI / 2, dt * 5);
    obj.rotation.y = r.heading;
  }

  private animateTown(dt: number, now: number) {
    const cam = this.camera.position;
    for (const m of this.markers) {
      m.position.y = m.userData.baseY + Math.sin(now / 300) * 0.3;
      const far = Math.max(1, cam.distanceTo(m.position) / 45);
      m.scale.setScalar((2.2 + Math.sin(now / 150) * 0.06) * far);
    }
    for (const s of this.signs) {
      s.position.y = s.userData.baseY + Math.sin(now / 400 + s.userData.phase) * 0.2;
      s.scale.setScalar(1.4 * Math.max(1, cam.distanceTo(s.position) / 45));
    }
    for (const b of this.bubbles.values()) b.position.y = b.userData.baseY + Math.sin(now / 420) * 0.08;
    for (const w of this.walkers) {
      w.obj.scale.set(PEOPLE_SCALE, PEOPLE_SCALE * (1 + Math.sin(now / 380 + w.phase) * 0.035), PEOPLE_SCALE);
      const dx = this.playerPos[0] - w.npc.at[0];
      const dz = this.playerPos[1] - w.npc.at[1];
      const near = this.playing && Math.hypot(dx, dz) < LOOK_RANGE;
      const want = near ? Math.atan2(dx, dz) : (w.npc.face * Math.PI) / 2;
      w.obj.rotation.y = turnToward(w.obj.rotation.y, want, dt * 6);
    }
    const focus = this.ride ? null : this.playerPos;
    for (const l of this.labels) l.visible = !this.playing || !focus || Math.hypot(l.position.x - focus[0], l.position.z - focus[1]) > LABEL_HIDE;
    for (const c of this.clouds) c.position.x = c.userData.baseX + Math.sin(now / 9000 + c.userData.baseX) * 30;
    this.driveBus(dt);
    this.updateSun();
    if (this.playing && this.scatter) {
      const f = this.ride ? this.rideBus!.position : this.player.position;
      this.scatter.update(f.x, f.z);
    }
  }

  /** 駅と雲山のあいだを往復し、端で少し止まる */
  private driveBus(dt: number) {
    if (!this.bus || !this.busLine) return;
    const b = this.busState;
    const line = this.busLine;
    if (b.wait > 0) {
      b.wait -= dt;
      return;
    }
    b.s += b.dir * BUS_SPEED * dt;
    if (b.s <= 0 || b.s >= line.total) {
      b.s = Math.min(Math.max(b.s, 0), line.total);
      b.dir *= -1;
      b.wait = 3;
    }
    line.t = b.s;
    const [pos, dir] = pointAt(line, b.s);
    this.bus.position.set(pos[0], this.groundY(pos), pos[1]);
    line.heading = turnToward(line.heading, Math.atan2(dir[0] * b.dir, dir[1] * b.dir) - Math.PI / 2, dt * 5);
    this.bus.rotation.y = line.heading;
  }

  /** 夕方に近づくほど日差しを橙に寄せる */
  private updateSun() {
    const { start_hour, end_hour } = this.world.meta.clock;
    const t = Math.min(Math.max((this.minutes - start_hour * 60) / ((end_hour - start_hour) * 60), 0), 1);
    this.sun.color.setRGB(1, 0.96 - t * 0.2, 0.88 - t * 0.38);
  }

  private moveCamera(dt: number, now: number) {
    if (!this.playing) {
      const a = now / 40000;
      this.camera.position.set(this.center.x + Math.sin(a) * 560, 480, this.center.z + Math.cos(a) * 560);
      this.camera.lookAt(this.center.x, 0, this.center.z);
      return;
    }
    const riding = this.ride !== null;
    const focus = riding ? this.rideBus!.position : this.player.position;
    const follow = focus.clone().add(riding ? RIDE_OFFSET : CAMERA_OFFSET);
    this.keepAboveGround(follow, focus);
    if (this.flyIn < 1) {
      this.flyIn = Math.min(1, this.flyIn + dt / 2.2);
      const e = 1 - Math.pow(1 - this.flyIn, 3);
      this.camera.position.lerpVectors(this.flyFrom, follow, e);
      this.fog.near = FOG_TITLE[0] + (FOG_PLAY[0] - FOG_TITLE[0]) * e;
      this.fog.far = FOG_TITLE[1] + (FOG_PLAY[1] - FOG_TITLE[1]) * e;
    } else {
      this.camera.position.lerp(follow, Math.min(1, dt * (riding ? 3 : 6)));
    }
    this.camera.lookAt(focus.x, focus.y + 1, focus.z);
    this.sun.position.set(focus.x + 30, focus.y + 50, focus.z + 20);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
  }

  /** 山がカメラと主人公のあいだに入らないよう、カメラを持ち上げる */
  private keepAboveGround(cam: THREE.Vector3, focus: THREE.Vector3) {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const x = focus.x + (cam.x - focus.x) * t;
      const z = focus.z + (cam.z - focus.z) * t;
      const need = heightAt(this.ground, x, z) + 2.5;
      cam.y = Math.max(cam.y, focus.y + (need - focus.y) / t);
    }
  }

  private report(now: number, dt: number) {
    const target = this.paused || this.ride ? this.lastTarget : nearestTarget(this.playerPos, this.world);
    this.showRing(target, now);
    const place = this.ride ? null : (this.towns?.placeAt(this.playerPos[0], this.playerPos[1]) ?? null);
    const mark = this.ride ? null : nearestMark(this.playerPos, this.world.marks);
    const id = (t: Target | null) => (!t ? null : t.type === "spot" ? t.spot.id : t.type === "npc" ? t.npc.id : `bus:${t.place.id}`);
    if (id(target) !== id(this.lastTarget) || place !== this.placeName || mark !== this.lastMark || Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
      this.lastTarget = target;
      this.placeName = place;
      this.lastMark = mark;
      this.onChange({ minutes: this.minutes, target, place, mark });
    }
  }

  private showRing(target: Target | null, now: number) {
    this.ring.visible = target !== null && !this.paused && !this.ride;
    if (!target) return;
    const at = targetAt(target);
    const r = target.type === "spot" ? target.spot.radius + 0.4 : target.type === "npc" ? 1.1 : 1;
    this.ring.position.set(at[0], this.groundY(at) + 0.15, at[1]);
    this.ring.scale.setScalar(r * (1 + Math.sin(now / 160) * 0.04));
  }

  /** 右上の地図。市の形・道・川の下絵に、依頼の場所・バス停・主人公を重ねる。1 秒に 10 回まで */
  private drawMap(now: number) {
    if (!this.map || !this.map.image.complete || Math.floor(now / 100) === Math.floor((now - 16) / 100)) return;
    const { canvas, image } = this.map;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (cw === 0) return;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const g = canvas.getContext("2d")!;
    const { x0, z0, cell } = this.city.grid;
    const scale = Math.min(cw / image.width, ch / image.height);
    const ox = (cw - image.width * scale) / 2;
    const oz = (ch - image.height * scale) / 2;
    const px = (at: Vec2): Vec2 => [ox + ((at[0] - x0) / cell) * scale, oz + ((at[1] - z0) / cell) * scale];
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true;
    g.drawImage(image, ox, oz, image.width * scale, image.height * scale);
    g.lineWidth = 2 * dpr;
    g.strokeStyle = INK;
    for (const s of this.world.stops) {
      const [x, y] = px(s.at);
      g.fillStyle = "#4d8c6b";
      g.fillRect(x - 3 * dpr, y - 3 * dpr, 6 * dpr, 6 * dpr);
    }
    for (const m of this.world.marks) {
      if (this.found.has(m.id)) continue;
      const [x, y] = px(m.at);
      g.fillStyle = "#fffaf0";
      g.beginPath();
      g.arc(x, y, 3 * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const s of this.world.spots) {
      const [x, y] = px(s.at);
      const done = this.answered.has(s.id);
      g.fillStyle = done ? "#b9ad97" : ACCENT;
      g.beginPath();
      g.arc(x, y, (done ? 3.5 : 5.5) * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const [x, y] = px(this.ride ? [this.rideBus!.position.x, this.rideBus!.position.z] : this.playerPos);
    const a = this.heading;
    const r = 7 * dpr;
    g.fillStyle = "#e0503c";
    g.beginPath();
    g.moveTo(x + Math.sin(a) * r, y + Math.cos(a) * r);
    g.lineTo(x + Math.sin(a + 2.5) * r * 0.75, y + Math.cos(a + 2.5) * r * 0.75);
    g.lineTo(x + Math.sin(a - 2.5) * r * 0.75, y + Math.cos(a - 2.5) * r * 0.75);
    g.closePath();
    g.fill();
    g.stroke();
  }
}

/** 折れ線の角を丸める。バスが角で急に向きを変えないように */
function rounded(path: Vec2[]): Vec2[] {
  const out: Vec2[] = [path[0]];
  for (let i = 1; i + 1 < path.length; i++) {
    const [a, v, b] = [path[i - 1], path[i], path[i + 1]];
    const da = Math.hypot(a[0] - v[0], a[1] - v[1]);
    const db = Math.hypot(b[0] - v[0], b[1] - v[1]);
    if (da < 1e-6 || db < 1e-6) continue;
    const ka = Math.min(CORNER, da / 2) / da;
    const kb = Math.min(CORNER, db / 2) / db;
    const p: Vec2 = [v[0] + (a[0] - v[0]) * ka, v[1] + (a[1] - v[1]) * ka];
    const q: Vec2 = [v[0] + (b[0] - v[0]) * kb, v[1] + (b[1] - v[1]) * kb];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const u = 1 - t;
      out.push([u * u * p[0] + 2 * u * t * v[0] + t * t * q[0], u * u * p[1] + 2 * u * t * v[1] + t * t * q[1]]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/** 折れ線の長さを測っておく。pointAt で距離から位置と向きを引く */
function measure(path: Vec2[]): Pick<Ride, "path" | "lengths" | "total"> {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return { path, lengths, total: lengths[lengths.length - 1] };
}

function pointAt(r: Pick<Ride, "path" | "lengths">, s: number): [Vec2, Vec2] {
  let i = 1;
  while (i < r.lengths.length - 1 && r.lengths[i] < s) i++;
  const a = r.path[i - 1];
  const b = r.path[i];
  const seg = Math.max(1e-6, r.lengths[i] - r.lengths[i - 1]);
  const t = Math.min(Math.max((s - r.lengths[i - 1]) / seg, 0), 1);
  return [
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg],
  ];
}

function toonGradient(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 輪郭線を付けない面（地面・海・雲）は outline を false にする */
function toonMat(color: THREE.ColorRepresentation, gradientMap: THREE.Texture, outline = true) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap });
  if (!outline) m.userData.outlineParameters = NO_OUTLINE;
  return m;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#8fcbee");
  grad.addColorStop(0.6, "#cdeaf5");
  grad.addColorStop(1, "#fbf1dc");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 決まった並びの乱数。読み込むたびに木の向きが変わらないように */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 角度を最短の向きで少しずつ回す */
function turnToward(from: number, to: number, step: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-step, Math.min(step, d));
}
