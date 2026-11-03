// MapLibre のカスタムレイヤーで three.js を描く。Blender で作った glb（public/models/）を停留所とバスに置く。
import * as maplibregl from "maplibre-gl";
import { withBase } from "@/lib/base";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BusPose } from "@/lib/busPosition";
import type { Stop } from "@/lib/impact";

const ORIGIN: [number, number] = [134.225, 35.49];
const M_PER_DEG_LAT = 111320;

// 原点からのメートル差。three の +X が東、+Z が北、+Y が上
function toLocal(lon: number, lat: number): [number, number] {
  const x = (lon - ORIGIN[0]) * M_PER_DEG_LAT * Math.cos((ORIGIN[1] * Math.PI) / 180);
  // MapLibre の例と同じ行列を使うので、local の +Z は南。北は -Z
  const z = -(lat - ORIGIN[1]) * M_PER_DEG_LAT;
  return [x, z];
}

// 画面上で同じくらいの大きさに見えるように、引くほど大きくする。実寸ではない
function zoomScale(zoom: number): number {
  return 2 ** (16 - zoom) * 4;
}
const STOP_EXTRA = 3;
const BUS_EXTRA = 2;

export class ThreeLayer implements maplibregl.CustomLayerInterface {
  id = "three-models";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map: maplibregl.Map | null = null;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private stopGroup = new THREE.Group();
  private busGroup = new THREE.Group();
  private busTemplate: THREE.Object3D | null = null;
  private buses: BusPose[] = [];
  private readonly stops: Stop[];

  constructor(stops: Stop[]) {
    this.stops = stops;
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(200, 400, -300);
    this.scene.add(sun);
    this.scene.add(this.stopGroup, this.busGroup);

    const loader = new GLTFLoader();
    loader.load(withBase("/models/stop.glb"), (gltf) => {
      for (const s of this.stops) {
        const o = gltf.scene.clone();
        const [x, z] = toLocal(s.lon, s.lat);
        o.position.set(x, 0, z);
        this.stopGroup.add(o);
      }
      map.triggerRepaint();
    });
    loader.load(withBase("/models/bus.glb"), (gltf) => {
      this.busTemplate = gltf.scene;
      this.setBuses(this.buses);
    });

    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }

  onRemove() {
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  // バスの位置を入れ替える。glb がまだ無ければ保持して、読めたときに置く
  setBuses(buses: BusPose[]) {
    this.buses = buses;
    if (!this.busTemplate) return;
    this.busGroup.clear();
    for (const b of buses) {
      const o = this.busTemplate.clone();
      const [x, z] = toLocal(b.lon, b.lat);
      o.position.set(x, 0, z);
      // Blender の +Y 前 は glTF で -Z 前 = 北。方位 b（北から時計回り）は Y 軸回りの -b
      o.rotation.y = (-b.bearing * Math.PI) / 180;
      this.busGroup.add(o);
    }
    this.map?.triggerRepaint();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    if (!this.map || !this.renderer) return;
    const origin = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0);
    const unit = origin.meterInMercatorCoordinateUnits();
    const s = zoomScale(this.map.getZoom());
    for (const o of this.stopGroup.children) o.scale.setScalar(s * STOP_EXTRA);
    for (const o of this.busGroup.children) o.scale.setScalar(s * BUS_EXTRA);
    const model = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(unit, -unit, unit))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
    this.camera.projectionMatrix = projection.multiply(model);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
