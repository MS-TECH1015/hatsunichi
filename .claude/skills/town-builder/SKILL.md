---
name: town-builder
description: data/raw/ の公式ファイルから、3D の町の data/world.json・public/city/ と、作業台の data/town.json を作り直す。データを足す・数字の出典を直す・札を増やすときに使う。
---

# town-builder

町の数字はスクリプトが公式ファイルから作る。LLM は数字を作らない。Claude の仕事は、入力を足したり規則を変えたりしたあとに、スクリプトを直して走らせ、テストと出典検査を通すことまで。

## 取る

1. 入力が増えるときは先に `scripts/fetch.sh` に URL と出典コメントを足し、1 回だけ実行する。取得済みの URL は PreToolUse フックが拒む。クロールしない
2. `data/SOURCES.md` の表に 1 行足す。SHA256 は `data/raw/fetch.log` から写す。生成 AI に使ってよいかが規約に無ければ「未確認」と書く

## 3D の町（data/world.json と public/city/）

3. `python scripts/build_city.py` 標高・行政区域・GTFS・町別人口から city.json・mask.bin・地図の下絵・places の座標を作る
4. `python scripts/build_marks.py` 町丁の「?」の札を world.json の marks に書く
5. `python scripts/build_facilities.py` 鳥取市の未活用施設を world.json の facilities に書く
6. 依頼の場所（spots）は手で書く。数字は facts に書き、各 fact の source を world.json の sources に置く。計算は `src/lib/calcs.ts` で、根拠の数字はその場所の facts の文にあるものだけ
7. `npm test` を通す。world.json の整合、札の位置、計算の根拠、確認役の数字の見張りを見る

## 作業台の町（data/town.json）

8. `scripts/build-town.mjs` の `SOURCES` に同じ `source_id` を足す。数値を持つ要素には必ず `source_id` を付ける。出典の無い値は `ASSUMPTIONS` にだけ置く
9. `npm run build:town` を実行する。`check-sources.mjs` が通らなければ town.json を直さず、スクリプトを直す
10. `data/town.json` を手で編集しない。編集した場合も PreToolUse フックが `source_id` の無い数値を拒む

## 守ること

- 実在の個人・民間の店や事業者・個別の空き家の位置を出さない。空き家バンクはリンクだけ
- 地区を特定できる施設は札にしない。施設の文は「今も使われていないかは未確認」で終え、市の公式の募集ではないと書く
- 市のサイトの写真・ロゴ・図は使わない。窓口は公式ページへのリンクだけで、電話番号やフォームを載せない
- 町の人・家・店・事業者は架空。姓は地名と重ねない
