"use client";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Dot, Resident, Town } from "@/lib/impact";
import type { ResidentState } from "@/lib/impact";

const GSI_PALE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
// Turbopack が MapLibre の worker を束ねられないので、public/ に置いた worker を直接指す（scripts/copy-worker.mjs）
const WORKER_URL = "/maplibre-gl-worker.mjs";

type Props = {
  town: Town;
  affected: Dot[];
  residentStates: Record<string, ResidentState>;
  onResidentClick?: (r: Resident) => void;
};

function dotsGeoJson(town: Town, affectedIds: Set<string>) {
  return {
    type: "FeatureCollection" as const,
    features: town.dots.map((d) => ({
      type: "Feature" as const,
      properties: { lit: affectedIds.has(d.dot_id) ? 1 : 0, purpose: d.purpose, hour: d.hour_band },
      geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] },
    })),
  };
}

function stopsGeoJson(town: Town) {
  return {
    type: "FeatureCollection" as const,
    features: town.stops.map((s) => ({
      type: "Feature" as const,
      properties: { name: s.name },
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
    })),
  };
}

// 路線の線は、停留所数が最も多い便の停留所列をつないだもの
function routesGeoJson(town: Town) {
  const families = [...new Set(town.trips.map((t) => t.family))];
  const byId = Object.fromEntries(town.stops.map((s) => [s.stop_id, s]));
  return {
    type: "FeatureCollection" as const,
    features: families.map((family) => {
      const longest = town.trips.filter((t) => t.family === family).sort((a, b) => b.stop_times.length - a.stop_times.length)[0];
      return {
        type: "Feature" as const,
        properties: { family },
        geometry: { type: "LineString" as const, coordinates: longest.stop_times.map((st) => [byId[st.stop_id].lon, byId[st.stop_id].lat]) },
      };
    }),
  };
}

export function TownMap({ town, affected, residentStates, onResidentClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          gsi: { type: "raster", tiles: [GSI_PALE], tileSize: 256, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>' },
        },
        layers: [{ id: "gsi", type: "raster", source: "gsi" }],
      },
      center: [134.225, 35.49],
      zoom: 12.3,
      attributionControl: { compact: false },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("routes", { type: "geojson", data: routesGeoJson(town) });
      m.addLayer({ id: "routes", type: "line", source: "routes", paint: { "line-color": "#4c6ef5", "line-width": 3, "line-opacity": 0.7 } });
      m.addSource("dots", { type: "geojson", data: dotsGeoJson(town, new Set()) });
      m.addLayer({
        id: "dots",
        type: "circle",
        source: "dots",
        paint: {
          "circle-radius": ["case", ["==", ["get", "lit"], 1], 5, 3],
          "circle-color": ["case", ["==", ["get", "lit"], 1], "#f59f00", "#adb5bd"],
          "circle-opacity": ["case", ["==", ["get", "lit"], 1], 0.95, 0.5],
        },
      });
      m.addSource("stops", { type: "geojson", data: stopsGeoJson(town) });
      m.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-radius": 4, "circle-color": "#fff", "circle-stroke-color": "#364fc7", "circle-stroke-width": 2 } });
      m.addLayer({
        id: "stop-labels",
        type: "symbol",
        source: "stops",
        minzoom: 13.5,
        layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
        paint: { "text-halo-color": "#fff", "text-halo-width": 1.2 },
      });
      for (const r of town.residents) {
        const el = document.createElement("button");
        el.className = "resident-pin";
        el.type = "button";
        el.textContent = `${r.name} 架空`;
        el.onclick = () => onResidentClick?.(r);
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([r.lon, r.lat]).addTo(m);
        markers.current.set(r.id, marker);
      }
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // 町は変わらない。初期化は1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource("dots") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(dotsGeoJson(town, new Set(affected.map((d) => d.dot_id))));
  }, [town, affected]);

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.getElement().dataset.state = residentStates[id] ?? "default";
    }
  }, [residentStates]);

  return <div ref={container} className="map" />;
}
