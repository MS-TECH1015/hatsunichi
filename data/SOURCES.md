# データの出典

取得は `scripts/fetch.sh` で各1回だけ。元ファイルは `data/raw/`（gitignore）に置き、リポジトリには加工後の `data/world.json` と `public/city/`・`public/models/city.glb` だけ入れる。標高タイルは `scripts/fetch_dem.py` で 1 枚ずつ 1.5 秒あけて取った。
SHA256 は取得時の `data/raw/fetch.log` から写した。

| source_id | 名前 | 提供元 | URL | 取得日 | SHA256 | ライセンス | 加工 |
|---|---|---|---|---|---|---|---|
| gtfs_nihonkotsu | 日本交通 GTFS-JP（鳥取県内の全路線） | 鳥取県オープンデータポータル 鳥取県バス情報。作成はジョルダン株式会社（県の委託） | https://odp-pref-tottori.tori-info.co.jp/bus.html → /bus_data/1.zip | 2026-11-03 | c0edbceff02538e024a2d2ec1ac4319c42ddda53104ed02ffc8ddc3d6bff5d16 | ポータル利用規約の既定 CC BY 2.1 JP。bus.html と zip 内に個別のライセンス表記なし | 雲山市立病院線と津ノ井若葉台循環線の平日便の本数を数えた。全便の停留所の並びを、地図の道とバスの経路に使った |
| pop_2026_09 | 鳥取市 町別世帯数、年齢（5歳階級）別人口（令和8年9月分・全地区） | 鳥取市公式ウェブサイト 総務課 | https://www.city.tottori.lg.jp/page/50374.html → /uploaded/attachment/53775.xlsx | 2026-11-03 | bd3c275b92bf660db5c01c12193ddd518303f346412c13f46065e3ae1a08ec4a | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。出典表示と加工の明記 | 町ごとの「計」行を使い、250 人につき家 1 軒を町の代表点のまわりに置いた。実在の建物の位置ではない |
| isj_19_0b | 位置参照情報 大字・町丁目レベル 鳥取県 19.0b | 位置参照情報ダウンロードサービス（国土交通省） | https://nlftp.mlit.go.jp/isj/ → /isj/dls/data/19.0b/31000-19.0b.zip | 2026-11-03 | ec4bf5b891a7c7bbf241e0dfa74e4abbf8afdec188febce3545a62d596ed4535 | 位置参照情報ダウンロードサービス利用約款（2026-11-06 に確認）。「大字・町丁目位置参照情報 国土交通省」の形で出典を書く | 鳥取市の町丁目の代表点を町名で人口表と突き合わせた。地名の札の位置にも使った |
| gtfs_hinomaru | 日ノ丸自動車 GTFS-JP | 鳥取県オープンデータポータル 鳥取県バス情報 | https://odp-pref-tottori.tori-info.co.jp/bus.html → /bus_data/2.zip | 2026-11-03 | 732b406e5580e63627d59b081da373fdd3616798264333a36536f90cf3430408 | 日本交通と同じ（規約の既定 CC BY 2.1 JP） | 全便の停留所の並びを、地図の道とバスの経路に使った。同じ名前で 400 m 以内の停留所は 1 つにまとめた |
| n03_2025 | 国土数値情報 行政区域データ 2025年（令和7年）鳥取県 | 国土交通省 国土数値情報ダウンロードサイト | https://nlftp.mlit.go.jp/ksj/ → /ksj/gml/data/N03/N03-2025/N03-20250101_31_GML.zip | 2026-11-03 | 1c1f63f88eba6053b98466a33d897780eba3fda1224f22fc0c1abdaf962ab2cf | CC BY 4.0（測量法に基づく国土地理院長承認 （複製）R 6JHf 503） | 鳥取市の境を、歩ける範囲と地図の色分けに使った |
| gsi_dem_z11 | 地理院タイル 標高タイル（DEM10B）ズーム 11 の 9 枚 | 国土地理院 | https://cyberjapandata.gsi.go.jp/xyz/dem_png/11/{x}/{y}.png（x 1786〜1788、y 807〜809） | 2026-11-03 | 9 枚それぞれの値は data/raw/fetch.log | 地理院タイル利用規約。出典明示で申請不要 | 100 m 格子に並べ直し、高さを 1.5 倍にして Blender で地形にした。川はこの標高から水の流れを計算して引いたもので、実在の川筋ではない |
| census_small | 令和2年国勢調査 町丁・字等別境界データ（A002005212020）、小地域集計 年齢（5歳階級）別人口 令和2年（T001082）・平成27年（T000849）鳥取県 | 政府統計の総合窓口(e-Stat)、総務省統計局 | https://www.e-stat.go.jp/gis/statmap-search → 境界 /data?dlserveyId=A002005212020&code=31&coordSys=1&format=shape&downloadType=5&datum=2000、表 /data?statsId=T001082&code=31&downloadType=2 と statsId=T000849 | 2026-11-04 | 境界 dde7162113438efdb9f8d063c675ebed7b00c476bcf0b51ddbd14c8d46b1a468、令和2年 a72c2764a89d113a5771ac538bb7fcdcf719e618056b730bbeb1310c924e1f2b、平成27年 f2928d319a33f09b23fb5a46a13222d5fa59437b760a7280695c94504b6fc139 | 政府標準利用規約 第2.0版（CC BY 4.0 互換）。「出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）」と「「国勢調査」（総務省）を加工して作成」 | 鳥取市の町丁ごとに人口総数、65 歳以上の割合（年齢の分かる人に対して）、平成27年からの増減を出し、境界の図形中心点に「?」の札を置いた。秘匿の町丁は使っていない |
| ksj_facilities | 国土数値情報 医療機関データ 令和2年度（P04）、学校データ 令和5年度（P29）鳥取県 | 国土交通省 国土数値情報ダウンロードサイト | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P04-2020.html → /ksj/gml/data/P04/P04-20/P04-20_31_GML.zip、https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29-2023.html → /ksj/gml/data/P29/P29-23/P29-23_31_GML.zip | 2026-11-04 | P04 78aac421e0865a166965d93a3e8ef2c502988eb1b2f0823ef57cd88f1f6f0f2f、P29 df70b4b79c67d41e60f6b0ea36c27e34401334bfd605c8913f15f3056e4b4189 | CC BY 4.0。「『国土数値情報（医療機関データ）』（国土交通省）（URL）をもとに作成」の形で表示 | 町丁の図形中心点から、県内の病院（医療機関分類が病院）と小学校（学校分類が小学校と義務教育学校）までの直線距離を出した。施設の名前と位置は画面に出さない |
| odp_facilities | 鳥取市 未活用施設の一覧（データセット 1652） | 鳥取県オープンデータポータル。データ提供は鳥取市（提供者名は財産経営課、現在の資産活用推進課） | https://odp-pref-tottori.tori-info.co.jp/dataset/1652.html → https://odp-pref-tottori.tori-info.co.jp/dataset/1652/url_resource/143/data_55-12_23.csv | 2026-11-05 | 79d05e16316a281111552db70c6dd381319574c7d5689d327c33cfb18bd51d30 | CC BY。データのページは版を書いていないので、ポータル規約の既定の CC BY 2.1 日本に従う。生成 AI での利用は記載なしで未確認 | 用途が公民館・園舎・体育館・浴場・調理室のものを、7 つの町の代表点から 2.5 km まで選び、名称・用途・延床面積・建築年を手帳の文にした。今も未活用かは未確認と画面に出す |
| mhlw_kaigo_r6 | 第9期介護保険事業計画に基づく介護職員の必要数について 別紙5 都道府県別（令和6年7月12日公表） | 厚生労働省 | https://www.mhlw.go.jp/content/12004000/001274768.pdf | 2026-11-05 | 79522d8b70a7f60c32929e5fdcecd6e08dfdf0550d0e2dacbc857730d0fd5930 | PDL1.0（2026-11-06 に厚労省の著作権のページで確認）。生成 AI での利用は未確認 | 鳥取県の行から、2022 年度の職員数と 2026・2040 年度に要る数、今の流れのままの数を河原の依頼に引いた |
| pref_shoubou_r4 | 鳥取県の消防 3 消防体制（令和4年4月1日現在） | 鳥取県 | https://www.pref.tottori.lg.jp/secure/1323317/3syouboutaisei.pdf | 2026-11-05 | 551a4e0b340a61ffb0f20ef99c15ea959b8d7f593517e5bdb040f5167e9176a6 | 利用条件と生成 AI での利用は未確認 | 表3-8・3-9・3-11・3-12 の鳥取市の行から、団員数・条例定員・充足率・平均年齢・令和3年度の新任と退職を国府の依頼に引いた。列の対応はページを画像にして確かめた |
| bunka_inaba_kokucho | 文化遺産オンライン 因幡国庁跡 | 文化庁 | https://online.bunka.go.jp/db/heritages/detail/139297 | 2026-11-06 | 62d374724f611c7b3e766453c991952966df7a5d466ad66556269287ac8e84dc | 利用規約のページは見つからず、ページの表示は All Rights Reserved。生成 AI での利用は未確認 | 指定の年月日と解説文の事実を、国府と福部のむかしに自分の言葉で短く引いた。文は写さない |
| bunka_tottori_jo | 文化遺産オンライン 鳥取城跡 附 太閤ヶ平 | 文化庁 | https://online.bunka.go.jp/db/heritages/detail/191522 | 2026-11-06 | c6b03f05771fc5021d21652b12af1ae042a42707cfc21c86bcb388a82f53109b | 同上 | 築城の始まり、天正9年の開城、池田家、指定の年を駅のむかしに引いた |
| pref_nagashibina | 記録作成等の措置を講ずべき無形の民俗文化財「用瀬の流しびな」 | 鳥取県 文化財課 | https://www.pref.tottori.lg.jp/295378.htm | 2026-11-06 | d6990260846bb8836a6c217eec45d067bff3cbae46ae22750767fd4950ffa382 | 利用条件と生成 AI での利用は未確認 | 行事の中身と選択の年を用瀬のむかしに引いた |
| pref_sakyu | 鳥取砂丘ってどこにあるの？ | 鳥取県 自然共生課 | https://www.pref.tottori.lg.jp/153169.htm | 2026-11-06 | 53c0e7372c21b7203d2b04ed6a0807df03b13cda7c2165ab3fbdbd13a7f7d408 | 利用条件と生成 AI での利用は未確認 | 砂丘の広さと4つの砂丘を、砂丘・福部・湖山のむかしに引いた |
| pref_maibun_kawahara | 鳥取埋文情報⑧ 八頭郡（千代川流域）の遺跡年表 | 鳥取県埋蔵文化財センター | https://www.pref.tottori.lg.jp/secure/76301/maibunj8.pdf | 2026-11-06 | 186aa52e855bbb102bbaaa788684924047b4e8e721489fa3de158f69fa4c69e5 | 県の著作権のページ 9314.htm に従う。生成 AI での利用は未確認 | 河原町の列から、縄文・古墳・奈良時代の遺跡の名前と、郷原遺跡から軒瓦が出たことを河原のむかしに引いた。列の対応はページを画像にして確かめた。表と図は写さない |
| pref_maibun_ketaka | 鳥取埋文情報⑨ 気高郡の遺跡年表 | 鳥取県埋蔵文化財センター | https://www.pref.tottori.lg.jp/secure/76301/maibunj9.pdf | 2026-11-06 | 881b5baa69ecba001f8630f715c30b22726db49e565e69c24e30fa55da2c2a7a | 同上 | 気高町の列から、縄文の遺跡、谷奥1号墳から銅鋺と馬鐸が出たこと、奈良時代の上原遺跡群を気高のむかしに引いた。列の対応は画像で確かめた |
| city_shien_r8 | 令和8年度 鳥取市中小企業・小規模企業支援制度のお知らせ | 鳥取市 経済・雇用戦略課 | https://www.city.tottori.lg.jp/page/5160.html | 2026-11-06 | c868c42a14c7c23a21948977f42e8f31a35665f29b5f0a71f1ab26cfca4dd538 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 「事業の構想として持ち帰る」1 枚の相談先にリンクだけ置いた。制度の名前や表は写さず、並ぶ制度の分野と、制度ごとに問い合わせ先が違うことを自分の言葉で書いた |
| pref_arikata_r2 | 地域における今後の職業教育機関の在り方について（令和2年3月） | 鳥取県 | https://www.pref.tottori.lg.jp/secure/1218876/arikatazentai.pdf | 2026-11-04 | 95031efcab25645602d70aaa0d84a4e0b952ed225ded1c7ba6b3a4c13561226c | 県の著作権のページ 9314.htm（2026-11-06 に確認）は、法で認められた場合を除き無断の複製・転用を禁じる。使うのは 1 つの数字と事実だけ。AI 利用の可否は未確認 | 県内進学者の県内残留率 14.2% の 1 文だけを自分の言葉で書き写した |
| tottori_shiseiteian_list | 市政提案 令和8年度の提案と回答の一覧 | 鳥取市 | https://www.city.tottori.lg.jp/site/shiseiteian/list97-628.html | 2026-11-04 | d6a483655fa1c6fc21309f37081299f29a76a3df0f109253419720d9c3fcede2 | 鳥取市のサイトの著作権の扱いに従う。AI 利用の可否は未確認 | 取得時点の件数 80 件だけを数えた |
| plateau_2020 | 3D都市モデル（Project PLATEAU）鳥取市（2020年度）3D Tiles・GeoJSON・MVT 版（v1） | 国土交通省 都市局。G空間情報センターで配布 | https://www.geospatial.jp/ckan/dataset/plateau-31201-tottori-shi-2020 → https://gsic-opendata.s3.ap-northeast-1.amazonaws.com/national-gov/mlit/city-bureau/3d-city-model/2020/plateau-31201-tottori-shi-2020/31201_tottori-shi_2020_3Dtiles_etc_1_op.zip | 2026-11-07 | cf7e4fd93e1f94958038b53cee195e6236715e64801b872ff44df32bb80fc540 | PLATEAU サイトポリシー 3（2026-11-07 に確認）により PDL1.0、CC BY 4.0 互換。「3D都市モデル（Project PLATEAU）鳥取市（2020年度）を加工して作成」と表示。配布元に robots.txt は無い。生成 AI での利用は記載なし | 9 町それぞれ、中心から 600 m の建物の屋根の外周と高さ、道路の面、土地利用の面、鉄道の中心線を町の中の座標に直した（scripts/build_real_towns.py）。建物の名前・用途・浸水の属性は使わない |
| akiya_bank_list | 空き家情報バンク 登録物件一覧表（2026年10月16日更新） | 鳥取市 建築指導課 空家対策係 | https://www.city.tottori.lg.jp/page/5828.html | 2026-11-07 | fce366d1b207a4959e27e53168911950e94a2d5f94e6f919c478114bf50faea3 | 鳥取市のコンテンツは PDL1.0（https://www.city.tottori.lg.jp/site/userguide/30271.html）。robots.txt は置いていない。写真と図面は使わない | 物件ごとの番号・種別・所在の町名だけを使い、町名の代表点（位置参照情報）に印を置いて、市の物件ページへリンクした。番地や建物は特定しない |
| win_stop | 交通政策課 | 鳥取県 交通政策課 | https://www.pref.tottori.lg.jp/koutuu/ | 2026-11-06 | 45d9560796254917b2ac00c326cdaf233e107dfd614cb2a28caa6e45119b6839 | 県のページは著作物（https://www.pref.tottori.lg.jp/9314.htm）。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_shop1 | まちなか未来創造課 | 鳥取市 まちなか未来創造課 | https://www.city.tottori.lg.jp/soshiki/57/ | 2026-11-06 | c7b7365b4dcb78b1d6f1c311b55c97340e47909d9fde4a09bb1f7b262bcbcad5 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_field1 | 地域計画を策定しました | 鳥取市 農政企画課 | https://www.city.tottori.lg.jp/page/5429.html | 2026-11-06 | 4d9242cfd9afcdcebe61b4d40b549db3355c5af95c40298035439e0c8f2ba623 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_cave | 気高の生姜（瑞穂生姜、日光生姜） | 鳥取市 気高町総合支所 地域振興課 | https://www.city.tottori.lg.jp/page/7017.html | 2026-11-06 | d1bedb7e66587bab37e0589ca8a5931adfb335a7756e25926417570c4ff91cd6 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_workshop | 事業承継支援 | 鳥取県 企業支援課 | https://www.pref.tottori.lg.jp/258682.htm | 2026-11-06 | 449b037daf830152314a2d95a7d8a38c8d4991eb25f39cab48687857cf5f08cf | 県のページは著作物（https://www.pref.tottori.lg.jp/9314.htm）。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_care1 | 各種相談窓口（地域包括支援センター等） | 鳥取県 長寿社会課 | https://www.pref.tottori.lg.jp/318584.htm | 2026-11-06 | 869ed352d5877c088cb6be1c0555a8c8eb47b44ca61f4606b1184653371d469f | 県のページは著作物（https://www.pref.tottori.lg.jp/9314.htm）。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_fire1 | 消防団について | 鳥取県 | https://www.pref.tottori.lg.jp/281025.htm | 2026-11-06 | a43cfc15bc5ee4df4d5ab04656ff7a2a73f474dee3b2a7e3eb78a3c3f665fbe0 | 県のページは著作物（https://www.pref.tottori.lg.jp/9314.htm）。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| win_fire1_hojokin | 鳥取県若者・女性の地域防災参画補助金 | 鳥取県 | https://www.pref.tottori.lg.jp/328533.htm | 2026-11-06 | 8fe73516336610e9dfa0dab1b1b9eddf03eb21187826ab72918466734577dbac | 県のページは著作物（https://www.pref.tottori.lg.jp/9314.htm）。生成 AI での利用は未確認 | 窓口がすでにしていること（world.json の spots[].window.doing）を、事実だけ自分の言葉で 1〜3 文に書いた。文と表は写さない |
| teian_51228 | 2026年10月19日 空き家（長年放置状態）の活用 | 鳥取市 | https://www.city.tottori.lg.jp/shiseiteian/shiseiteian/51228.html | 2026-11-06 | 87c564dbbe4a6dab7385f6421482d9fb4556810e74457a942c4678481ba9aad0 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 題と受付日とページの更新日をそのまま、市の回答は要旨を自分の言葉で 1〜2 文に書いた（world.json の spots[].heard）。提案した人の文と、地名・人の手がかりは写さない |
| teian_47036 | 2026年8月3日 用瀬駅前バス停について | 鳥取市 | https://www.city.tottori.lg.jp/shiseiteian/shiseiteian/47036.html | 2026-11-06 | 3ddb775f3e968b3063dee4c2e95df215ef940b5bd991ed792f68e02b47d162ec | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 題と受付日とページの更新日をそのまま、市の回答は要旨を自分の言葉で 1〜2 文に書いた（world.json の spots[].heard）。提案した人の文と、地名・人の手がかりは写さない |
| teian_42044 | 2026年5月18日 早急に「防火水槽」設置を切望ー防火水源確保 | 鳥取市 | https://www.city.tottori.lg.jp/shiseiteian/shiseiteian/42044.html | 2026-11-06 | 8ec5e9a6022b79aba594c88ec356a9da12c1f3e8f6b4afb6109ce0eb5b4294c6 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 題と受付日とページの更新日をそのまま、市の回答は要旨を自分の言葉で 1〜2 文に書いた（world.json の spots[].heard）。提案した人の文と、地名・人の手がかりは写さない |
| shiseiteian_r8_again | 市政提案 令和8年度の提案と回答の一覧（題を見るため 2 回目） | 鳥取市 | https://www.city.tottori.lg.jp/site/shiseiteian/list97-628.html | 2026-11-06 | d6a483655fa1c6fc21309f37081299f29a76a3df0f109253419720d9c3fcede2 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 2026-11-04 に件数を数えたときはファイルを残していなかった。依頼に近い題を探すため、もう 1 回だけ取った。SHA256 は 11-04 と同じで、ページは変わっていなかった。80 件の題から、依頼の言葉に近い 3 件を選んだ |
| shiseiteian_top | 市政提案～市長への手紙～ 入口 | 鳥取市 | https://www.city.tottori.lg.jp/site/shiseiteian/ | 2026-11-06 | 67d7ce3f86035f0ca558952142cbb516760c5c39c696c8cdc3b4cb1f02b09cd1 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 分野ごとの一覧があることを確かめただけ。分野の一覧は取っていない |
| shiseiteian_r7 | 市政提案 令和7年度の提案と回答の一覧 | 鳥取市 | https://www.city.tottori.lg.jp/site/shiseiteian/list97-383.html | 2026-11-06 | d1dd0532bc6904c606821877ebc2d98c194a85884f304d6f28675d24036999a3 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 令和8年度の一覧に、便の数・運転士・消防団に入る人の話が無かったので取った。載っていたのは 2025-11-14 から 2026-03-30 までの 39 件で、どの話も無かった。バス停と消防団の依頼には、同じ話は無いと書いたうえで近い 1 件を出す |
| tottori_feeder | 令和5年度 鳥取市地域内フィーダー系統確保維持計画の変更について | 鳥取市 | https://www.city.tottori.lg.jp/uploaded/attachment/25724.pdf | 2026-11-06 | d1ea711ed9b77ed5eb3effd46a0082d1b288579f2065bf375556a1118d18a497 | 鳥取市のサイトの利用条件は未確認（市のオープンデータ利用規約の本文 PDF は 404）。数値と事実だけを使う。robots.txt は置いていない。生成 AI での利用は未確認 | 2026-11-04 に乗合タクシーの利用者数を取ったときはファイルを残していなかった。運転手不足の記述を確かめるため、もう 1 回だけ取った。SHA256 は world.json に写した 11-04 の値と同じ。2ページの目的・必要性を自分の言葉で 1 文にし、雲山のバス停の根拠に足した |

取得したがまだ使っていないもの
- 鳥取県介護サービス事業所一覧 CSV（CC BY、/dataset/1888、SHA256 51d10aaecefb04195b4da7b4424622a610bd8876090e68482dbe6a2d7bc286a8）
- 鳥取市教育機関一覧 CSV（CC BY、/dataset/1890、SHA256 51dfca24f3899cd8e4f4005c754dcd73305d4f40a4ddfdcab5ce6221e95df239）

## ライセンスの確認状態（2026-11-03）

- 鳥取県オープンデータポータルの利用規約は、別途表示の無いコンテンツに CC BY 2.1 JP が適用されると書いている。バス情報ページと GTFS の zip（agency.txt・feed_info.txt）にはライセンスの個別表記が無い。したがって規約の既定に従い、出典を「鳥取県オープンデータポータル 鳥取県バス情報（日本交通 GTFS-JP、作成: ジョルダン株式会社）」と表示する。県の交通政策課への確認は未実施
- 鳥取市のページには個別のライセンス表記が無く、サイト全体の利用条件も未確認。数値と事実だけを使い、「出典：鳥取市公式ウェブサイト（URL）」と加工の旨を表示する
- 位置参照情報は利用約款に従い、「大字・町丁目位置参照情報 19.0b（国土交通省）をもとに作成」と書く。「編集・加工した情報を、あたかも国が作成したかのような態様で公表・利用してはいけません」に従い、点の配置は作者の想定だと明記する
- 地理院タイルは出典明示のみで申請不要 [出典: https://maps.gsi.go.jp/development/ichiran.html]
- 国土数値情報 N03 は CC BY 4.0。「国土数値情報（行政区域データ）を加工して作成」と表示する
- e-Stat は政府標準利用規約 第2.0版、国土数値情報の医療機関（令和2年度）と学校（令和5年度）は CC BY 4.0。学校データの平成25年度版は非商用なので使っていない [確認 2026-11-04: https://www.e-stat.go.jp/terms-of-use 、上の 2 つの詳細ページ]
- 国土数値情報の規約が測量法の承認を求めるのは、背景図を含む国土調査の成果だけ。このアプリの使い方では申請は要らない（2026-11-06 に規約で確認）
- AI での利用について、各規約に個別の条項があるかは確かめていない（未確認）

## 作者が置いたもの（データではない）

- 家と木の位置。家は町丁目の人口から数を決め、木は標高と傾きから置いた見た目
- 川の線。標高から計算した流れで、場所の広場の近くでは切ってある
- 人・店・相談の中身。地名と地形だけが実在

## 画面での出典表示

- 時刻表: 鳥取県オープンデータポータル 鳥取県バス情報（日本交通 GTFS-JP）を加工
- 人口: 出典：鳥取市公式ウェブサイト（https://www.city.tottori.lg.jp/page/50374.html）。「町別世帯数、年齢（5歳階級）別人口」を加工して作成
- 町の代表点: 大字・町丁目位置参照情報 19.0b（国土交通省）をもとに作成
- 自分の家の近く: 使う人が選んだ町名の代表点（位置参照情報）から、空き家バンクの物件の町名の代表点、未活用施設、停留所（日本交通・日ノ丸自動車 GTFS-JP の stops.txt）までをまっすぐ測った。平日の便は calendar.txt で水曜に走る便が stop_times.txt でその停留所に止まる回数。scripts/build_near.py が public/city/near.json に書く。町名は使う人のブラウザの中だけで使い、送らない
- 題の画面の下に、このファイルへのリンクと、ライブラリと書体のライセンスの写し `public/licenses/` へのリンクを置いた
- 地形: 国土地理院 標高タイルを加工（タイトル画面と右上の地図の下）
- 市の境: 国土数値情報（行政区域データ）を加工して作成

## robots.txt と著作権のページ（2026-11-06 に読んだ）

取った 28 件の URL は、どれも各サイトの robots.txt の Disallow に当たらない。robots.txt は各サイトで 1 回ずつ取った。
2026-11-06 に足した市政提案のページ 5 件と、窓口のページ 8 件も、県のサイトの Disallow（/dde.aspx、/secure/221685/ など）に当たらない。市のサイトは robots.txt を置いていない。1 件ごとに 10 秒あけて取った。

| サイト | robots.txt | 著作権・利用のページ |
|---|---|---|
| online.bunka.go.jp | すべて許可。Crawl-delay 10 秒 | 「このサイトについて」で、掲載情報は著作物で、法律で認められた範囲を除き無断の転用・引用・改変を禁じる。2 ページを 10 秒あけずに続けて取り、1 ページは WebFetch でも 1 回読んだので、Crawl-delay を守れていなかった。以後 fetch.sh は 1 件ごとに 10 秒あける |
| www.pref.tottori.lg.jp | /dde.aspx などの一部だけ禁止。取った 3 件は当たらない | https://www.pref.tottori.lg.jp/9314.htm 。文章や写真は著作物で、私的使用の複製や引用など法律で認められた場合を除き、無断で複製・転用できない。許諾は各ページの担当課へ |
| www.e-stat.go.jp | /core/ /profiles/ や登録の道だけ禁止。取った /gis/ は当たらない | https://www.e-stat.go.jp/terms-of-use 。政府標準利用規約 第2.0版で CC BY 4.0 と互換、商用も可。数値データと簡単な表は著作権の対象でなく自由に使える。出典と加工の旨を書き、国が作ったように見せない。ゲームの表示は census_small の名前と注記で満たしている。生成 AI での利用は語で探して見当たらず、未確認。SHA256 0efa0be58bb58a5d55580875cf78b1030d554d6e1ca573f6711c371087d59d15 |
| www.mhlw.go.jp | /cgi-bin/ /images/ など一部だけ禁止。取った /content/ は当たらない | https://www.mhlw.go.jp/chosakuken/index.html 。権利表記の無いものは公共データ利用規約 第1.0版（PDL1.0）。出典にページの URL と利用日を書き、加工したらその旨を書く。これに合わせ、ゲームの出典名に「を加工」を足した。日付は出典の横に出ている。生成 AI での利用は語で探して見当たらず、未確認。SHA256 094afd93700b959f3d8d99ae1b7dbf5f8f4d4bf5a70c525f6f9c06f72d0b7265 |
| www.city.tottori.lg.jp、odp-pref-tottori.tori-info.co.jp、nlftp.mlit.go.jp、cyberjapandata.gsi.go.jp | 置いていない（404） | 未読。オープンデータは各データの頁に CC BY などの条件がある |

県と文化庁のページから引いたのは、指定の年や出来事などの事実だけで、文と表は写していない。

著作権法は e-Gov 法令 API v2 から 1 回取って読んだ（https://laws.e-gov.go.jp/api/2/law_data/345AC0000000048?response_format=xml 、2026-11-06、SHA256 は fetch.log）。laws.e-gov.go.jp は robots.txt を置いていない（アプリの画面が返る）。

- 条文で確かめたこと
  - 第2条1項1号: 著作物は「思想又は感情を創作的に表現したもの」
  - 第10条2項: 事実の伝達にすぎない雑報と時事の報道は、言語の著作物にあたらない
  - 第13条: 法令や国・自治体の告示・訓令・通達は権利の目的にならない。県や文化庁の解説ページはこれに入らない
  - 第32条1項: 公表された著作物は、公正な慣行に合い、目的上正当な範囲なら引用できる
  - 第32条2項: 国や自治体が周知のために出した資料は、禁止の表示がなければ新聞・雑誌などの刊行物に説明の材料として転載できる。ウェブのゲームが刊行物に入るかは条文からは分からない
  - 第30条の4: 表現を味わう目的でない情報解析などには使える。ただし著作権者の利益を不当に害する場合は除く
- 学習時点の知識で、条文では確かめていないこと
  - 「城を築いた年」「史跡に指定された年」のような事実は、第2条の創作的な表現にあたらず、自分の言葉で短く書けば複製にあたらないという考え方が一般的
  - 文を写さず事実だけ書く今の使い方は、引用（第32条1項）に頼っていない。引用に頼るなら、かぎかっこで区別し、出典を付け、本文が主で引用が従という条件が要る
- ゲームの外へ広く出す前に、文化庁と県の文化財課に、この使い方でよいかを聞く

## 規約と使用条件の点検（2026-11-06）

審査に出す前に読み直した。各ページ 1 回で、robots.txt を先に見た。SHA256 は取れた分だけ書く。

- 位置参照情報ダウンロードサービス利用約款 https://nlftp.mlit.go.jp/isj/agreement.html 、SHA256 53a53c3f6e829d48e124ece7e30b844c0c37b15f0dc3c333079c7d3c23f2da1a 。加工した成果を載せるときは「大字・町丁目位置参照情報 国土交通省」の形で出典を書き、整備年・ファイル名・加工した者もできるだけ書く。画面に足した
- 国土数値情報の使用許諾: 医療機関 P04 令和2年度（SHA256 e09a9c2d1b74e07fb31f2e959336aa885b08fb26cd6791056fea3380af832e3d）、学校 P29 令和5年度（a6360dcb9a8f3cc32a47879f914b1895a4c17b6afdc7baf03ddb94bd4a05c451）、行政区域 N03 2025年（f584c5bfd4f92c04a057ef85537a76d9fb2acb85c9e85a4e6680159f3d997bff）はどれも CC BY 4.0。規約は https://nlftp.mlit.go.jp/ksj/other/agreement.html
- 鳥取県の著作権のページ https://www.pref.tottori.lg.jp/9314.htm 、SHA256 43e1390d8a04124210d0d445218dc9618a56a4af116cc869f5d69494651c08e0 。法で認められた場合を除き、無断の複製・転用はできない。県の資料から使うのは事実と数字だけ
- 鳥取市オープンデータ利用規約は、本文の PDF が 404 で読めていない。市のサイトの利用条件は未確認のまま、数値と事実だけを使う
- Anthropic 商用規約 https://www.anthropic.com/legal/commercial-terms 、2025-06-17 から効く版。出力を確かめずに頼らないよう利用者に伝える義務（D.3）に合わせ、題の画面と、付箋と予行の下に書いた。対応地域の外へ出さない義務（D.2、M.9）に合わせ、中継は日本からだけ受ける
- Anthropic 利用ポリシー https://www.anthropic.com/legal/aup 、2026-11-12 から効く版。18 歳未満が使う製品には追加の条件がある。対象を 18 歳以上の大学生と画面と README に書いた
- Cloudflare 開発者プラットフォームの規約 https://www.cloudflare.com/service-specific-terms-developer-platform/ と、KV の上限 https://developers.cloudflare.com/kv/platform/limits/ 。無料プランの KV の書き込みは 1 日 1,000 回、同じキーへは 1 秒に 1 回まで。中継は通した回だけ 2 件書き、1 日 100 回で止める
- 書体 Zen Maru Gothic の SIL OFL 1.1 は https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/OFL.txt 、Draco の Apache License 2.0 は https://raw.githubusercontent.com/google/draco/main/LICENSE 。どちらも 2026-11-06 に取った。先頭だけ読んだあと写しを置くためにもう 1 回取ったので、各 2 回。写しは `public/licenses/`。raw.githubusercontent.com は robots.txt を置いていない（404）
- 文化遺産オンラインと鳥取県のページは、事実だけを自分の言葉で書いている
- AI での利用を個別に定めた条項があるかは、どの規約でも確かめていない（未確認）

ライセンスの URI: CC BY 4.0 https://creativecommons.org/licenses/by/4.0/legalcode.ja 、CC BY 2.1 日本 https://creativecommons.org/licenses/by/2.1/jp/legalcode
