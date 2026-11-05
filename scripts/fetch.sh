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
# 国土数値情報 行政区域 N03 2025 鳥取県 https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html （CC BY 4.0、出典表示）
fetch "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_31_GML.zip" n03_2025_31.zip
# e-Stat 令和2年国勢調査 町丁・字等別境界データ 鳥取県（政府標準利用規約 第2.0版、出典表示と加工の明記）
fetch "https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=31&coordSys=1&format=shape&downloadType=5&datum=2000" estat_r2ka31.zip
# e-Stat 国勢調査 小地域集計 年齢（5歳階級）別人口 鳥取県 令和2年 T001082・平成27年 T000849
fetch "https://www.e-stat.go.jp/gis/statmap-search/data?statsId=T001082&code=31&downloadType=2" estat_T001082_31.zip
fetch "https://www.e-stat.go.jp/gis/statmap-search/data?statsId=T000849&code=31&downloadType=2" estat_T000849_31.zip
# 国土数値情報 医療機関 令和2年度 P04 と 学校 令和5年度 P29 鳥取県（CC BY 4.0、出典表示）
fetch "https://nlftp.mlit.go.jp/ksj/gml/data/P04/P04-20/P04-20_31_GML.zip" ksj_P04-20_31.zip
fetch "https://nlftp.mlit.go.jp/ksj/gml/data/P29/P29-23/P29-23_31_GML.zip" ksj_P29-23_31.zip
# 鳥取市 公共施設一覧のうち未活用施設 鳥取県オープンデータポータル（CC BY、出典と加工の表示）
fetch "https://odp-pref-tottori.tori-info.co.jp/dataset/1652/url_resource/143/data_55-12_23.csv" odp_1652_mikatsuyo.csv
# 厚生労働省 第9期介護保険事業計画に基づく介護職員の必要数について 別紙5 都道府県別 令和6年7月12日 https://www.mhlw.go.jp/stf/newpage_41379.html
fetch "https://www.mhlw.go.jp/content/12004000/001274768.pdf" mhlw_kaigo_hitsuyosu_r6.pdf
# 鳥取県 鳥取県の消防 3 消防体制 令和4年4月1日現在（県の公式サイト。数字を事実として引くだけで、文や表は写さない）
fetch "https://www.pref.tottori.lg.jp/secure/1323317/3syouboutaisei.pdf" pref_shoubou_taisei_r4.pdf
