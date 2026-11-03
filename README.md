# hatsunichi

鳥取市を歩いて、町の困りごとに一言の案を出す、仕事の初日のゲーム。

- 地形・地名・市の境・バスの道は公開データ。人・店・相談は架空
- 画面の数字はすべて出典に戻れる
- 提出は選考に使わず、本人にだけ返す

Built with Claude: Japan 2026 に向けて 2026-11-02 以降に新規に作成。コードは MIT License。データは `data/SOURCES.md` に書いた各提供元のライセンスに従う。

## 何をする画面か

鳥取市全域を Blender で模型にした町を、主人公（地方の大学生）が歩く。

1. 白兎に話しかけられて初日が始まる。矢印で歩き、Shift か歩き続けると走る
2. 「！」の印に近づいて Space で調べると、住民から相談が来る。3 つの案から 1 つ選ぶと判子が押される
3. 「くわしく」で、なんでこうなっているか・数字の出典・案への付箋（良い点・抜け・問い）・公的な相談窓口が開く
4. バス停から、駅・雲山・湖山・福部・気高・用瀬・鳥取砂丘へ乗れる。乗った距離に応じて時計が進む
5. 案が 3 つそろうか 17 時を過ぎると終業

右上の地図は押すと大きくなる。バスの減便を地図で決める作業台は `/map` に残している。

### 市の模型の作り方

- `scripts/build_city.py` が標高タイル・市の境・GTFS・人口から 100 m 格子の地形と色、川、バスの道、家と木の位置、場所どうしのバス経路を作る
- `scripts/blender/city.py` が Blender で地形を組み、面を 22% まで減らし、川と道を地面に沿わせて `public/models/city.glb`（Draco 圧縮で約 430 KB）と足もとの高さ `public/city/height.bin` を書く
- 家と木は `scripts/blender/models.py` の軽い模型を、画面側で区画ごとにまとめて何千も並べる

## 動かし方

```bash
npm install
bash scripts/fetch.sh        # 元データを1回だけ取得（data/raw/。再実行しても取り直さない）
npm run build:town           # data/town.json を生成（/map の作業台）
python scripts/fetch_dem.py  # 標高タイル 9 枚を 1 回だけ取得
python scripts/build_city.py # 市の格子・道・家と木の位置・バス経路
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python scripts/blender/city.py   # 地形の glb
npm run dev                  # http://localhost:3000
```

API キーが無くても動く。`npm run demo` で本番ビルドを起動すると、確認役は計算結果だけから組んだ固定文を返す。
Claude に読ませるには `.env` に `ANTHROPIC_API_KEY` を書く（`.env.example` を見る）。モデルは `REVIEW_MODEL` で選ぶ。既定は claude-opus-5-5。

```bash
npm test                     # vitest
npm run check:sources        # town.json の数字に出典が付いているか
npm run eval                 # 確認役の測定。docs/eval/<モデル>.md に書く
```

### 公開と確認役

- 公開先は GitHub Pages: https://ms-tech1015.github.io/hatsunichi/ 。静的書き出し（`output: "export"`）なので、Pages 上の確認役は鍵なしの demo の付箋を画面側で作る
- 配備は `npm run deploy`。`out/` を gh-pages ブランチへ push する。`.github/workflows/pages.yml` の Actions 配備も用意してあるが、push には gh の `workflow` スコープが要る
- 本物の確認役は手元で動かす。`.env` に `ANTHROPIC_API_KEY` を書き、`npm run review` で http://localhost:8787/review を立て、`NEXT_PUBLIC_REVIEW_URL=http://localhost:8787/review npm run dev` で画面を向ける。このとき提出文は Anthropic の API に送られる（学習には使われず、既定で 30 日以内に消える）

## 数字の出し方

- 停留所から 400m 以内の町の人口を、20人 = 1点にして町の代表点のまわりに散らす
- 点には目的（通学・通勤・通院・買い物）と時間帯を年齢構成から割り当てる
- 便を外したとき、その便の停留所の時間帯に一致し、前後30分に残る便が無い点を「影響あり」とする
- 人数 = 影響ありの点 × 20 × 乗車率。乗車率は仮定（既定 0.3、±0.1 で幅を出す）

仮定の値はすべて `data/town.json` の `assumptions` にあり、画面では「想定」「仮定」のチップを付ける。出典チップを押すと提供元・取得日・SHA256 が開く。

## 確認役

`src/lib/review.ts`。Messages API の tool use で `submit_review`（good・gap・question）を強制し、返ってきた文の数字を計算結果と提出用紙の数字と照合する。無い数字が混ざっていたら理由を添えて作り直させ、3回で通らなければ数字を伏せて返す。作り直しの回数は画面に出す。

点数・採点・ランキングの語は使わない。提出内容はサーバーに残さない。残るのは本人が同意した「ひとこと」だけで、それも本人のブラウザの中。

## Claude Code の使い方

- `.claude/hooks/require-source.mjs` — `data/*.json` を書くとき、出典の無い数字があれば止める
- `.claude/hooks/fetch-once.mjs` — 提供元のサイトへの再取得を止める。取得は `scripts/fetch.sh` の1回だけ
- `.claude/hooks/devlog.mjs` — 区切りごとに `docs/devlog.md` へ1行
- `.claude/skills/town-builder` `job-ticket` — 町の生成と依頼票の書き方
- `.claude/agents/data-auditor.md` — 数字の出典を見直す読み取り専用の役

## 依頼票を変える

`tickets/路線名.md` を置くと、次の表示から依頼票が変わる。2枚あれば「第2週」のタブが出る。依頼者に実在の人物・事業者は書かない。

## データとライセンス

`data/SOURCES.md`。バスは鳥取県オープンデータポータルの日本交通・日ノ丸自動車 GTFS-JP、人口は鳥取市の町別人口、町の代表点は国土交通省の位置参照情報、市の境は国土数値情報（行政区域）、地形は国土地理院の標高タイル。タイトル画面と右上の地図の下に表示文を置いている。

## このリポジトリに無いもの

- 元データの zip・xlsx。取得 URL・日付・SHA256 は `data/SOURCES.md`
- API キー。`.env.example` を見る
- 試した学生の提出内容。集計だけ `docs/trial.md`
