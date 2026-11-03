// three.js の模型の町。Blender で作った glb を並べ、主人公を歩かせ、後ろ上からカメラが追う。
// React 側（Town.tsx）は、この class の onChange で時刻と話せる相手を受け取る
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { withBase } from "@/lib/base";
import { inMeters, nearestTarget, pushOut, roadTiles, PROP_RADIUS, type Target, type Vec2, type World } from "@/lib/world";

export type SceneState = { minutes: number; target: Target | null };

const GRASS = 0xb5cf8f;
const SKY = 0xcfe7f5;
const WALK_SPEED = 5; // m/s
const CAMERA_OFFSET = new THREE.Vector3(0, 17, 19);

export class TownScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private models = new Map<string, THREE.Group>();
  private player = new THREE.Group();
  private playerPos: Vec2;
  private keys = new Set<string>();
  private touchDir: Vec2 = [0, 0];
  private obstacles: { at: Vec2; radius: number }[] = [];
  private markers: THREE.Sprite[] = [];
  private answered = new Set<string>();
  private minutes: number;
  private paused = false;
  private last = performance.now();
  private raf = 0;
  private lastTarget: Target | null = null;

  private world: World;

  constructor(private canvas: HTMLCanvasElement, world: World, private onChange: (s: SceneState) => void) {
    this.world = inMeters(world);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 60, 140);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.playerPos = [...this.world.meta.start] as Vec2;
    this.minutes = this.world.meta.clock.start_hour * 60;
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  async start() {
    this.addLights();
    this.addGround();
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

  /** 会話中は歩けない。閉じたら時刻を少し進める */
  setPaused(paused: boolean) {
    if (this.paused && !paused) this.minutes += this.world.meta.clock.minutes_per_talk;
    this.paused = paused;
    this.keys.clear();
  }

  markAnswered(spotId: string) {
    this.answered.add(spotId);
    const m = this.markers.find((s) => s.userData.spotId === spotId);
    if (m) m.visible = false;
  }

  setTouchDir(dir: Vec2) {
    this.touchDir = dir;
  }

  /** 自動の通し確認と動画撮影用。?debug のときだけ window.__town から読む */
  get position(): Vec2 {
    return this.playerPos;
  }

  get state(): SceneState {
    return { minutes: this.minutes, target: nearestTarget(this.playerPos, this.world) };
  }

  private resize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.type === "keydown") this.keys.add(e.key.toLowerCase());
    else this.keys.delete(e.key.toLowerCase());
  };

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a98a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 60;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 200;
    this.scene.add(sun);
  }

  private addGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: GRASS }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private async loadModels() {
    const loader = new GLTFLoader();
    const kinds = new Set<string>(["road", "person", "rabbit", "stop", "bus"]);
    for (const p of this.world.props) kinds.add(p.kind);
    for (const s of this.world.spots) kinds.add(s.kind);
    await Promise.all(
      [...kinds].map(
        (kind) =>
          new Promise<void>((resolve, reject) =>
            loader.load(
              withBase(`/models/${kind}.glb`),
              (gltf) => {
                gltf.scene.traverse((o) => {
                  if (o instanceof THREE.Mesh) {
                    o.castShadow = kind !== "road";
                    o.receiveShadow = true;
                  }
                });
                this.models.set(kind, gltf.scene);
                resolve();
              },
              undefined,
              reject,
            ),
          ),
      ),
    );
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
    const tile = this.world.meta.tile;
    for (const t of roadTiles(this.world.roads)) this.place("road", [t[0] * tile, t[1] * tile], 0);
    for (const p of this.world.props) {
      this.place(p.kind, p.at, p.face);
      const r = PROP_RADIUS[p.kind];
      if (r) this.obstacles.push({ at: p.at, radius: r });
    }
    for (const s of this.world.spots) {
      this.place(s.kind, s.at, s.face);
      if (s.kind === "stop") this.place("bus", [s.at[0] + 5, s.at[1] - 3.5], 1);
      this.obstacles.push({ at: s.at, radius: s.radius });
      this.markers.push(this.addMarker(s.id, s.at, s.kind === "field" ? 2 : 5.5));
    }
    for (const n of this.world.npcs) {
      const o = this.place(n.kind, n.at, n.face);
      if (n.body) this.tint(o, n.body);
      this.obstacles.push({ at: n.at, radius: 0.8 });
    }
  }

  /** 胴の色を役割ごとに変える。person_body の材質だけ差し替える */
  private tint(o: THREE.Object3D, rgb: [number, number, number]) {
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.material = mats.map((mat) => (mat.name === "person_body" ? new THREE.MeshStandardMaterial({ color: new THREE.Color(...rgb) }) : mat));
      if (!Array.isArray(m.material) || m.material.length === 1) m.material = m.material[0];
    });
  }

  /** 違和感の印。朱の「！」を浮かべる */
  private addMarker(spotId: string, at: Vec2, height: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9480f";
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 88px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("!", 64, 70);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sprite.position.set(at[0], height, at[1]);
    sprite.scale.setScalar(1.6);
    sprite.userData = { spotId, baseY: height };
    this.scene.add(sprite);
    return sprite;
  }

  private buildPlayer() {
    const body = this.models.get("person")!.clone();
    this.tint(body, [0.2, 0.45, 0.8]);
    this.player.add(body);
    this.scene.add(this.player);
    this.syncPlayer();
  }

  private syncPlayer() {
    this.player.position.set(this.playerPos[0], 0, this.playerPos[1]);
    const target = this.player.position.clone();
    this.camera.position.copy(target).add(CAMERA_OFFSET);
    this.camera.lookAt(target.x, 1, target.z);
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

    if (!this.paused) {
      this.minutes += dt * this.world.meta.clock.minutes_per_second;
      const [dx, dz] = this.inputDir();
      if (dx !== 0 || dz !== 0) {
        const next: Vec2 = [this.playerPos[0] + dx * WALK_SPEED * dt, this.playerPos[1] + dz * WALK_SPEED * dt];
        this.playerPos = pushOut(next, this.obstacles);
        this.player.rotation.y = Math.atan2(dx, dz);
        this.player.position.y = Math.abs(Math.sin(now / 90)) * 0.08;
      }
      this.syncPlayer();
    }

    for (const m of this.markers) m.position.y = m.userData.baseY + Math.sin(now / 350) * 0.25;
    this.renderer.render(this.scene, this.camera);

    const target = nearestTarget(this.playerPos, this.world);
    const changed = (target?.type === "spot" ? target.spot.id : target?.npc.id) !== (this.lastTarget?.type === "spot" ? this.lastTarget.spot.id : this.lastTarget?.npc.id);
    if (changed || Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
      this.lastTarget = target;
      this.onChange({ minutes: this.minutes, target });
    }
  };
}
