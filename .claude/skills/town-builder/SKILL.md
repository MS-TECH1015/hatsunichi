---
name: town-builder
description: data/raw/ の公式ファイルから data/town.json を作り直す。データを足す・路線を替える・数字の出典を直すときに使う。
---

# town-builder

`scripts/build-town.mjs` が町を作る。LLM は数字を作らない。Claude の仕事は、入力を足したり規則を変えたりしたあとに、このスクリプトを直して走らせ、出典検査を通すことまで。

## 手順

1. 入力が増えるときは先に `scripts/fetch.sh` に URL と出典コメントを足し、1回だけ実行する。取得済みの URL は PreToolUse フックが拒む
2. `data/SOURCES.md` の表に1行足す。SHA256 は `data/raw/fetch.log` から写す
3. `scripts/build-town.mjs` の `SOURCES` に同じ `source_id` を足す。数値を持つ要素には必ず `source_id` を付ける。出典の無い値は `ASSUMPTIONS` にだけ置く
4. `npm run build:town` を実行する。`check-sources.mjs` が通らなければ town.json を直さず、スクリプトを直す
5. `data/town.json` を手で編集しない。編集した場合も PreToolUse フックが `source_id` の無い数値を拒む

## 守ること

- 実在の個人を表す点を作らない。点は町の代表点の周りに散らした想定
- 住民3人は架空。姓は地名と重ねない。年齢と目的はその町の年齢構成の範囲で選ぶ
- 事業者名は出典表示の範囲でだけ使う。依頼元にしない
