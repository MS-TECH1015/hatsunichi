# hatsunichi

鳥取の大学生が申し込まずに開ける、実データで減便を決める仕事の初日。

- 時刻表と人口は公開データ、依頼は架空
- 提出は選考に使わず、本人にだけ返す
- 数字はすべて出典に戻れる

Built with Claude: Japan 2026 に向けて 2026-11-02 以降に新規に作成。コードは MIT License。データは `data/SOURCES.md` に書いた各提供元のライセンスに従う。

## 何をする画面か

鳥取市の路線バス2系統（雲山市立病院線・津ノ井若葉台循環線）の平日63便を地図に置き、架空の依頼票「平日の便のうち3便を減らす案を1枚にする」に答える。

1. 便一覧で「外す」を押すと、その便にしか乗れない人の点が地図で灯り、「影響 low〜high人／日」の幅が出る
2. 住民ピン（架空の4人）を押すと、影響あり・なしの理由が計算式つきで出る
3. 提出用紙の4欄（減らす便・理由・影響を受ける人・代替案）を書いて提出する
4. 確認役が付箋を3枚返す。良い点1・抜け1・問い1。採点はしない
5. もう一度提出すると、1回目との差分（影響の幅・外した便の数）が出る

時刻スライダーを動かすと、その時刻に走っているバスが地図の上を動く。バスと停留所の標識は Blender で作った glb（`scripts/blender/models.py`）。

## 動かし方

```bash
npm install
bash scripts/fetch.sh        # 元データを1回だけ取得（data/raw/。再実行しても取り直さない）
npm run build:town           # data/town.json を生成
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

`data/SOURCES.md`。時刻表は鳥取県オープンデータポータルの日本交通 GTFS-JP、人口は鳥取市の町別人口、町の代表点は国土交通省の位置参照情報、地図は地理院タイル。画面の下に表示文を置いている。

## このリポジトリに無いもの

- 元データの zip・xlsx。取得 URL・日付・SHA256 は `data/SOURCES.md`
- API キー。`.env.example` を見る
- 試した学生の提出内容。集計だけ `docs/trial.md`
