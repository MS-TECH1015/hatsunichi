#!/usr/bin/env bash
# 町ごとに OpenStreetMap の建物・道・川・鉄道・土地の使い方を 1 回だけ取る。再実行しない。
# 取り先は Private.coffee の Overpass。robots.txt は置いておらず、利用規約（2026-11-07 に確認）は
# 商用も含めて使ってよく、意味のある User-Agent と POST を勧め、OpenStreetMap の帰属表示を求める。
# overpass-api.de は robots.txt が /api/ を Disallow、Geofabrik は .pbf と .zip を Disallow のため使わない。
# データは ODbL 1.0。画面とクレジットに「© OpenStreetMap contributors（ODbL）」を出す。
# 使い方: bash scripts/fetch_osm.sh eki kumoyama ...（引数なしなら data/world.json の places 全部）
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=data/raw/osm
mkdir -p "$RAW"
API=https://overpass.private.coffee/api/interpreter
UA="hatsunichi/0.1 (+https://github.com/MS-TECH1015/hatsunichi; one request per town)"
B=600   # 建物を取る半径（m）
R=800   # 道・川・土地を取る半径（m）

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  mapfile -t ids < <(python -c "import json;[print(p['id']) for p in json.load(open('data/world.json',encoding='utf-8'))['places']]")
fi

for id in "${ids[@]}"; do
  out="$RAW/$id.json"
  if [ -f "$out" ]; then echo "skip (already fetched): $out"; continue; fi
  geo=$(python -c "import json,sys;p=[p for p in json.load(open('data/world.json',encoding='utf-8'))['places'] if p['id']=='$id'][0];print(f\"{p['geo'][0]},{p['geo'][1]}\")")
  q="[out:json][timeout:90];(
way[building](around:$B,$geo);relation[building](around:$B,$geo);
way[highway](around:$R,$geo);way[railway](around:$R,$geo);node[railway~\"^(station|halt)$\"](around:$R,$geo);
way[waterway](around:$R,$geo);way[natural](around:$R,$geo);relation[natural=water](around:$R,$geo);
way[landuse](around:$R,$geo);relation[landuse](around:$R,$geo);way[leisure](around:$R,$geo);
way[amenity~\"^(school|parking|hospital|university|college|kindergarten)$\"](around:$R,$geo);node[highway=bus_stop](around:$R,$geo);
);out geom;"
  curl -sS --retry 0 -A "$UA" --data-urlencode "data=$q" -o "$out" "$API"
  echo "$(date +%Y-%m-%d) $(sha256sum "$out" | cut -d' ' -f1) $API POST $id around $B/$R m of $geo" >> data/raw/fetch.log
  echo "fetched: $out ($(wc -c < "$out") bytes)"
  sleep 10
done
