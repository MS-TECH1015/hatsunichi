// three.js の模型の町。Blender で作った glb を浮き島に並べ、主人公を歩かせ、斜め上からカメラが追う。
// 見た目はトゥーン（3段の陰）と輪郭線。React 側（Town.tsx）は onChange で時刻と話せる相手を受け取る
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { withBase } from "@/lib/base";
import { clampToIsland, inMeters, nearestTarget, pushOut, roadTiles, PROP_RADIUS, type Npc, type Target, type Vec2, type World } from "@/lib/world";

export type SceneState = { minutes: number; target: Target | null };

const SEA = 0x6fb1d4;
const SHALLOW = 0xa8dbe6;
const GRASS = 0x9fce6c;
const CLIFF = 0x9a7350;
const ACCENT = "#ffc23d";
const INK = "#2b2622";
const OUTLINE: [number, number, number] = [0.17, 0.14, 0.12];
const WALK_SPEED = 6; // m/s
const CAMERA_OFFSET = new THREE.Vector3(0, 15, 12.5);
const PEOPLE_SCALE = 1.35; // 人は建物より大きめにして、表情と動きを見せる
const LOOK_RANGE = 6; // 住民がこちらを向く距離
const BUS_SPEED = 7;
const NO_OUTLINE = { visible: false };

type Walker = { obj: THREE.Object3D; npc: Npc; phase: number };

export class TownScene {
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private gradient = toonGradient();
  private toonCache = new Map<string, THREE.Material>();
  private models = new Map<string, THREE.Group>();
  private player = new THREE.Group();
  private playerPos: Vec2;
  private heading = 0;
  private keys = new Set<string>();
  private touchDir: Vec2 = [0, 0];
  private obstacles: { at: Vec2; radius: number }[] = [];
  private markers: THREE.Sprite[] = [];
  private bubbles = new Map<string, THREE.Sprite>();
  private walkers: Walker[] = [];
  private clouds: THREE.Group[] = [];
  private ring: THREE.Mesh;
  private bus: THREE.Object3D | null = null;
  private busState = { x: -46, dir: 1, wait: 0 };
  private minutes: number;
  private paused = true;
  private playing = false;
  private flyIn = 1;
  private flyFrom = new THREE.Vector3();
  private last = performance.now();
  private raf = 0;
  private lastTarget: Target | null = null;
  private world: World;

  constructor(private canvas: HTMLCanvasElement, world: World, private onChange: (s: SceneState) => void) {
    this.world = inMeters(world);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.effect = new OutlineEffect(this.renderer, { defaultThickness: 0.0032, defaultColor: OUTLINE });
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xd8eef2, 110, 320);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
    this.playerPos = [...this.world.meta.start] as Vec2;
    this.minutes = this.world.meta.clock.start_hour * 60;
    this.ring = this.makeRing();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  async start() {
    this.addLights();
    this.addIsland();
    await this.loadModels();
    this.buildTown();
    this.buildPlayer();
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
    if (this.paused && !paused && this.playing) this.minutes += this.world.meta.clock.minutes_per_talk;
    this.paused = paused;
    this.keys.clear();
  }

  markAnswered(spotId: string) {
    const m = this.markers.find((s) => s.userData.spotId === spotId);
    if (m) m.visible = false;
  }

  markTalked(npcId: string) {
    const b = this.bubbles.get(npcId);
    if (b) b.visible = false;
  }

  /** 話しかけた相手のほうへ向く。at はメートル */
  faceTo(at: Vec2) {
    this.heading = Math.atan2(at[0] - this.playerPos[0], at[1] - this.playerPos[1]);
    this.player.rotation.y = this.heading;
  }

  setTouchDir(dir: Vec2) {
    this.touchDir = dir;
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
    this.setShadowSize(90);
    this.scene.add(this.sun, this.sun.target);
  }

  private setShadowSize(s: number) {
    const cam = this.sun.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.far = 260;
    cam.updateProjectionMatrix();
  }

  /** 草の載った浮き島と、まわりの海 */
  private addIsland() {
    const { min, max } = this.world.meta.island;
    const shape = roundedRect(min[0], min[1], max[0], max[1], 10);

    const top = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.5, bevelSegments: 3 }),
      toonMat(GRASS, this.gradient, false),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = -0.8;
    top.receiveShadow = true;

    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false }), toonMat(CLIFF, this.gradient));
    body.rotation.x = -Math.PI / 2;
    body.position.y = -7.6;

    const shallowShape = roundedRect(min[0] - 7, min[1] - 7, max[0] + 7, max[1] + 7, 16);
    const shallow = new THREE.Mesh(new THREE.ShapeGeometry(shallowShape), toonMat(SHALLOW, this.gradient, false));
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.y = -3.9;

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), toonMat(SEA, this.gradient, false));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -4;

    this.scene.add(top, body, shallow, sea);
    this.addClouds();
  }

  /** タイトルの空撮でだけ見える高さに雲を浮かべる */
  private addClouds() {
    const white = toonMat(0xffffff, this.gradient, false);
    const spots: [number, number, number][] = [[-60, 34, -70], [40, 30, -90], [80, 38, 10], [-90, 32, 20], [10, 42, -130]];
    for (const [x, y, z] of spots) {
      const cloud = new THREE.Group();
      for (const [dx, dy, r] of [[0, 0, 6], [6, -1, 4.5], [-6, -1.5, 4], [2, 3, 4]]) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), white);
        puff.position.set(dx, dy, 0);
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      cloud.userData.baseX = x;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private async loadModels() {
    const loader = new GLTFLoader();
    const kinds = new Set<string>(["road", "person", "player", "rabbit", "stop", "bus"]);
    for (const p of this.world.props) kinds.add(p.kind);
    for (const s of this.world.spots) kinds.add(s.kind);
    await Promise.all(
      [...kinds].map(async (kind) => {
        const gltf = await loader.loadAsync(withBase(`/models/${kind}.glb`));
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => this.toon(m)) : this.toon(o.material);
          o.castShadow = kind !== "road" && kind !== "hill";
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

  private place(kind: string, at: Vec2, face: number, scale = 1): THREE.Group {
    const base = this.models.get(kind);
    if (!base) throw new Error(`部品が無い: ${kind}`);
    const o = base.clone();
    o.position.set(at[0], 0, at[1]);
    o.rotation.y = (face * Math.PI) / 2;
    o.scale.setScalar(scale);
    this.scene.add(o);
    return o;
  }

  private buildTown() {
    this.buildRoads();
    for (const p of this.world.props) {
      this.place(p.kind, p.at, p.face, p.scale);
      const r = PROP_RADIUS[p.kind];
      if (r) this.obstacles.push({ at: p.at, radius: r * (p.scale ?? 1) });
    }
    this.buildWires();
    for (const s of this.world.spots) {
      const o = this.place(s.kind, s.at, s.face);
      this.obstacles.push({ at: s.at, radius: s.radius });
      const top = new THREE.Box3().setFromObject(o).max.y;
      this.markers.push(this.addMarker(s.id, s.at, top + 1.6));
    }
    this.bus = this.place("bus", [this.busState.x, -1.2], 0);
    for (const n of this.world.npcs) {
      const o = this.place(n.kind, n.at, n.face, PEOPLE_SCALE);
      if (n.body) this.tint(o, "person_body", n.body);
      if (n.hair) this.tint(o, "person_hair", n.hair);
      this.obstacles.push({ at: n.at, radius: 0.8 });
      this.walkers.push({ obj: o, npc: n, phase: n.at[0] + n.at[1] });
      this.bubbles.set(n.id, this.addBubble(n.at, n.kind === "rabbit" ? 2.6 : 2.8));
    }
  }

  /** 道のタイルは数が多いので、1つの InstancedMesh にまとめて描く */
  private buildRoads() {
    const tile = this.world.meta.tile;
    let src: THREE.Mesh | undefined;
    this.models.get("road")!.traverse((o) => {
      if (o instanceof THREE.Mesh) src = o;
    });
    if (!src) return;
    const tiles = roadTiles(this.world.roads);
    const material = src.material as THREE.Material;
    material.userData.outlineParameters = NO_OUTLINE;
    const roads = new THREE.InstancedMesh(src.geometry, material, tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach((t, i) => roads.setMatrixAt(i, m.makeTranslation(t[0] * tile, 0, t[1] * tile)));
    roads.receiveShadow = true;
    this.scene.add(roads);
  }

  /** 同じ列に並ぶ電柱どうしを、たるんだ電線でつなぐ */
  private buildWires() {
    const rows = new Map<number, Vec2[]>();
    for (const p of this.world.props) {
      if (p.kind === "pole") rows.set(p.at[1], [...(rows.get(p.at[1]) ?? []), p.at]);
    }
    const mat = new THREE.LineBasicMaterial({ color: INK });
    for (const row of rows.values()) {
      row.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i + 1 < row.length; i++) {
        for (const dz of [-0.6, 0.6]) {
          const a = new THREE.Vector3(row[i][0], 6.75, row[i][1] + dz);
          const b = new THREE.Vector3(row[i + 1][0], 6.75, row[i + 1][1] + dz);
          const mid = a.clone().lerp(b, 0.5).setY(6.1);
          const points = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(16);
          this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
        }
      }
    }
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

  /** 違和感の印。山吹の風船に「！」 */
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
    sprite.userData = { spotId, baseY: height };
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

  private sprite(draw: (g: CanvasRenderingContext2D) => void): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
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
    this.player.position.set(this.playerPos[0], 0, this.playerPos[1]);
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

    if (this.playing && !this.paused) this.walk(dt, now);
    this.animateTown(dt, now);
    this.moveCamera(dt, now);
    this.effect.render(this.scene, this.camera);
    if (this.playing) this.report(now, dt);
  };

  private walk(dt: number, now: number) {
    this.minutes += dt * this.world.meta.clock.minutes_per_second;
    const [dx, dz] = this.inputDir();
    const body = this.player.children[0];
    if (dx === 0 && dz === 0) {
      body.position.y = 0;
      body.rotation.z = 0;
      body.scale.set(1, 1 + Math.sin(now / 500) * 0.015, 1);
      return;
    }
    const next: Vec2 = [this.playerPos[0] + dx * WALK_SPEED * dt, this.playerPos[1] + dz * WALK_SPEED * dt];
    this.playerPos = clampToIsland(pushOut(next, this.obstacles), this.world.meta.island);
    this.heading = turnToward(this.heading, Math.atan2(dx, dz), dt * 12);
    this.player.rotation.y = this.heading;
    const step = Math.sin(now / 75);
    body.position.y = Math.abs(step) * 0.14;
    body.scale.set(1 + Math.abs(step) * 0.04, 1 - Math.abs(step) * 0.04, 1);
    body.rotation.z = step * 0.06;
    this.player.position.set(this.playerPos[0], 0, this.playerPos[1]);
  }

  private animateTown(dt: number, now: number) {
    for (const m of this.markers) {
      m.position.y = m.userData.baseY + Math.sin(now / 300) * 0.3;
      m.scale.setScalar(2.2 + Math.sin(now / 150) * 0.06);
    }
    for (const b of this.bubbles.values()) b.position.y = b.userData.baseY + Math.sin(now / 420) * 0.08;
    for (const w of this.walkers) {
      w.obj.scale.set(1, 1 + Math.sin(now / 380 + w.phase) * 0.035, 1);
      const dx = this.playerPos[0] - w.npc.at[0];
      const dz = this.playerPos[1] - w.npc.at[1];
      const near = this.playing && Math.hypot(dx, dz) < LOOK_RANGE;
      const want = near ? Math.atan2(dx, dz) : (w.npc.face * Math.PI) / 2;
      w.obj.rotation.y = turnToward(w.obj.rotation.y, want, dt * 6);
    }
    for (const c of this.clouds) c.position.x = c.userData.baseX + Math.sin(now / 9000 + c.userData.baseX) * 12;
    this.driveBus(dt);
    this.updateSun();
  }

  /** バスは表の通りを往復し、停留所で少し止まる。人が前にいたら待つ */
  private driveBus(dt: number) {
    if (!this.bus) return;
    const b = this.busState;
    const laneZ = b.dir > 0 ? -1.2 : 1.2;
    const stopX = this.world.spots.find((s) => s.kind === "stop")?.at[0] ?? 0;
    const ahead = (this.playerPos[0] - b.x) * b.dir;
    const blocked = Math.abs(this.playerPos[1] - laneZ) < 2 && ahead > 0 && ahead < 6.5;
    if (b.wait > 0) b.wait -= dt;
    else if (!blocked) {
      const before = b.x;
      b.x += b.dir * BUS_SPEED * dt;
      if (b.dir < 0 && before > stopX + 2 && b.x <= stopX + 2) b.wait = 3;
      if (Math.abs(b.x) > 50) {
        b.dir *= -1;
        b.x = Math.sign(b.x) * 50;
      }
    }
    this.bus.position.set(b.x, 0, laneZ);
    this.bus.rotation.y = b.dir > 0 ? 0 : Math.PI;
  }

  /** 夕方に近づくほど日差しを橙に寄せる */
  private updateSun() {
    const { start_hour, end_hour } = this.world.meta.clock;
    const t = Math.min(Math.max((this.minutes - start_hour * 60) / ((end_hour - start_hour) * 60), 0), 1);
    this.sun.color.setRGB(1, 0.96 - t * 0.2, 0.88 - t * 0.38);
  }

  private moveCamera(dt: number, now: number) {
    const focus = this.player.position;
    const follow = focus.clone().add(CAMERA_OFFSET);
    if (!this.playing) {
      const a = now / 14000;
      this.camera.position.set(Math.sin(a) * 105, 62, Math.cos(a) * 105 - 8);
      this.camera.lookAt(0, 0, -8);
      return;
    }
    if (this.flyIn < 1) {
      this.flyIn = Math.min(1, this.flyIn + dt / 1.6);
      const e = 1 - Math.pow(1 - this.flyIn, 3);
      this.camera.position.lerpVectors(this.flyFrom, follow, e);
      if (this.flyIn === 1) this.setShadowSize(40);
    } else {
      this.camera.position.lerp(follow, Math.min(1, dt * 6));
    }
    this.camera.lookAt(focus.x, 1, focus.z);
    this.sun.position.set(focus.x + 30, 50, focus.z + 20);
    this.sun.target.position.set(focus.x, 0, focus.z);
  }

  private report(now: number, dt: number) {
    const target = this.paused ? this.lastTarget : nearestTarget(this.playerPos, this.world);
    this.showRing(target, now);
    const id = (t: Target | null) => (t?.type === "spot" ? t.spot.id : t?.npc.id);
    if (id(target) !== id(this.lastTarget) || Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
      this.lastTarget = target;
      this.onChange({ minutes: this.minutes, target });
    }
  }

  private showRing(target: Target | null, now: number) {
    this.ring.visible = target !== null && !this.paused;
    if (!target) return;
    const at = target.type === "spot" ? target.spot.at : target.npc.at;
    const r = target.type === "spot" ? target.spot.radius + 0.4 : 1.1;
    this.ring.position.set(at[0], 0.12, at[1]);
    this.ring.scale.setScalar(r * (1 + Math.sin(now / 160) * 0.04));
  }
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

/** XZ 平面の角丸の四角。Shape の y は、寝かせたあと -z になる */
function roundedRect(x0: number, z0: number, x1: number, z1: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const top = -z0;
  const bottom = -z1;
  s.moveTo(x0 + r, bottom);
  s.lineTo(x1 - r, bottom);
  s.quadraticCurveTo(x1, bottom, x1, bottom + r);
  s.lineTo(x1, top - r);
  s.quadraticCurveTo(x1, top, x1 - r, top);
  s.lineTo(x0 + r, top);
  s.quadraticCurveTo(x0, top, x0, top - r);
  s.lineTo(x0, bottom + r);
  s.quadraticCurveTo(x0, bottom, x0 + r, bottom);
  return s;
}

/** 角度を最短の向きで少しずつ回す */
function turnToward(from: number, to: number, step: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-step, Math.min(step, d));
}
