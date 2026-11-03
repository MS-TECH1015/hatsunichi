#!/usr/bin/env bash
# 公式が配っているファイルを1回だけ落とす。再実行しない。
# 落としたファイルは data/raw/（gitignore）。取得日と SHA256 を data/SOURCES.md に手で写す。
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=data/raw
mkdir -p "$RAW"

fetch() {
  local url="$1" out="$2"
  if [ -f "$RAW/$out" ]; then
    echo "skip (already fetched): $out"
    return
  fi
  curl -sSL --retry 0 -A "hatsunichi/0.1 (one-time fetch; Built with Claude Japan 2026)" -o "$RAW/$out" "$url"
  echo "$(date +%Y-%m-%d) $(sha256sum "$RAW/$out" | cut -d' ' -f1) $url" >> "$RAW/fetch.log"
  echo "fetched: $out"
}

# 鳥取県オープンデータポータル 鳥取県バス情報 https://odp-pref-tottori.tori-info.co.jp/bus.html
fetch "https://odp-pref-tottori.tori-info.co.jp/bus_data/1.zip" gtfs_nihonkotsu.zip   # 日本交通 GTFS-JP
fetch "https://odp-pref-tottori.tori-info.co.jp/bus_data/2.zip" gtfs_hinomaru.zip     # 日ノ丸自動車 GTFS-JP
# 鳥取県介護サービス事業所一覧 CC BY https://odp-pref-tottori.tori-info.co.jp/dataset/1888.html
fetch "https://odp-pref-tottori.tori-info.co.jp/dataset/1888/resource/9618/310000_care_service.csv" care_service.csv
# 鳥取市教育機関一覧 CC BY https://odp-pref-tottori.tori-info.co.jp/dataset/1890.html
fetch "https://odp-pref-tottori.tori-info.co.jp/dataset/1890/resource/9622/312011_educational_institution.csv" educational_institution.csv
# 鳥取市 町別世帯数、年齢(5歳階級)別人口（令和8年9月分） 全地区 https://www.city.tottori.lg.jp/page/50374.html
fetch "https://www.city.tottori.lg.jp/uploaded/attachment/53775.xlsx" population_2026-09.xlsx
# 国土交通省 位置参照情報 大字・町丁目レベル 鳥取県 19.0b https://nlftp.mlit.go.jp/isj/ （PDL1.0、出典表示）
fetch "https://nlftp.mlit.go.jp/isj/dls/data/19.0b/31000-19.0b.zip" isj_31000-19.0b.zip
