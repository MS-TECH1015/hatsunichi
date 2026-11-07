// 依頼の場所ごとの小さな計算。根拠の数字（bases）は、その場所の facts の文に書いてある数字だけを使う。
// 本人が動かす前提（knobs）は画面で「推定」と出し、1枚にも前提の値ごと載せる。正解を出す計算ではなく、案の大きさを町の数字と比べる物差し

export type Knob = { id: string; label: string; unit: string; min: number; max: number; step: number; value: number };

export type Calc = {
  /** 何を確かめる計算か */
  ask: string;
  /** 根拠の数字。spot.facts[fact] の文に value が書いてある */
  bases: { fact: number; value: number }[];
  knobs: Knob[];
  /** 前提の値から、結果の一文を作る */
  say: (k: Record<string, number>) => string;
};

const n = (v: number, digits = 0) => v.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const pct = (part: number, whole: number) => `${n((100 * part) / whole, part / whole < 0.1 ? 1 : 0)}%`;

export const CALCS: Record<string, Calc> = {
  stop: {
    ask: "運転する人が今の割合で減り続けると、雲山の平日の便は何本になる？",
    bases: [
      { fact: 0, value: 63 },
      { fact: 1, value: 11.3 },
    ],
    knobs: [
      { id: "years", label: "何年後", unit: "年", min: 2, max: 20, step: 2, value: 10 },
      { id: "slow", label: "案で減り方をおさえる割合", unit: "%", min: 0, max: 100, step: 10, value: 0 },
    ],
    say: ({ years, slow }) => {
      const rate = 11.3 * (1 - slow / 100);
      const left = 63 * (1 - rate / 100) ** (years / 2);
      return `運転する人が 2 年に ${n(rate, 1)}% ずつ減り、便も同じ割合で減るとすると、${years} 年後の平日の便は 約 ${n(left)} 本。今の 63 本から 約 ${n(63 - left)} 本減る`;
    },
  },
  empty1: {
    ask: "鳥取市の空き家 4,207 件を、学生の見回りで 1 周するのに何年かかる？",
    bases: [{ fact: 2, value: 4207 }],
    knobs: [
      { id: "people", label: "見回る学生", unit: "人", min: 1, max: 50, step: 1, value: 10 },
      { id: "times", label: "1 人が月に回る回数", unit: "回", min: 1, max: 8, step: 1, value: 1 },
      { id: "houses", label: "1 回で見る家", unit: "件", min: 1, max: 10, step: 1, value: 3 },
    ],
    say: ({ people, times, houses }) => {
      const perYear = people * times * houses * 12;
      return `学生 ${people} 人が月に ${times} 回、1 回 ${houses} 件ずつ見ると、1 年で ${n(perYear)} 件。4,207 件を 1 周するのに 約 ${n(4207 / perYear, 1)} 年`;
    },
  },
  lodging: {
    ask: "大学へ通える空き家を学生の下宿にすると、何人が住めて、家主に家賃がいくら入る？",
    bases: [{ fact: 0, value: 2 }],
    knobs: [
      { id: "houses", label: "下宿にする家", unit: "件", min: 1, max: 20, step: 1, value: 2 },
      { id: "per", label: "1 件に住む学生", unit: "人", min: 1, max: 6, step: 1, value: 3 },
      { id: "rent", label: "1 人の家賃（月）", unit: "万円", min: 1, max: 5, step: 1, value: 2 },
    ],
    say: ({ houses, per, rent }) =>
      `${houses} 件に学生が ${per} 人ずつ、月 ${rent} 万円で住むと、${n(houses * per)} 人の住まいになり、家主に入る家賃は年 ${n(houses * per * rent * 12)} 万円。今、大学へ乗り換えなしのバスで通える登録物件は 2 件`,
  },
  care1: {
    ask: "学生が介護の仕事を週に何時間か受け持つと、2040 年度に県で足りなくなる人数のどれくらいに届く？",
    bases: [
      { fact: 0, value: 12745 },
      { fact: 0, value: 9791 },
    ],
    knobs: [
      { id: "people", label: "受け持つ学生", unit: "人", min: 10, max: 500, step: 10, value: 50 },
      { id: "hours", label: "1 人が週に働く時間", unit: "時間", min: 1, max: 20, step: 1, value: 4 },
      { id: "full", label: "職員 1 人が週に働く時間", unit: "時間", min: 30, max: 40, step: 1, value: 38 },
    ],
    say: ({ people, hours, full }) => {
      const short = 12745 - 9791;
      const fte = (people * hours) / full;
      return `2040 年度に要る 12,745 人と、今の流れのままの 9,791 人の差は ${n(short)} 人。学生 ${people} 人が週に ${hours} 時間ずつ働くと、職員 約 ${n(fte, 1)} 人分で、差の ${pct(fte, short)}`;
    },
  },
  fire1: {
    ask: "学生が毎年消防団に入ると、何年後に条例の定員 1,354 人へ近づく？",
    bases: [
      { fact: 0, value: 1262 },
      { fact: 0, value: 1354 },
      { fact: 1, value: 39 },
      { fact: 1, value: 45 },
    ],
    knobs: [
      { id: "years", label: "何年後", unit: "年", min: 1, max: 20, step: 1, value: 10 },
      { id: "people", label: "毎年入る学生", unit: "人", min: 1, max: 50, step: 1, value: 10 },
      { id: "stay", label: "1 人が続ける年数", unit: "年", min: 1, max: 6, step: 1, value: 2 },
    ],
    say: ({ years, people, stay }) => {
      const trend = 1262 + (39 - 45) * years;
      const total = trend + people * Math.min(years, stay);
      return `1 年に 39 人入り 45 人やめる流れのままだと、${years} 年後は 約 ${n(trend)} 人。学生が毎年 ${people} 人入って ${stay} 年ずつ続けると 約 ${n(total)} 人で、定員 1,354 人の ${pct(total, 1354)}`;
    },
  },
  shop1: {
    ask: "駅のまわりの空き店舗 65 のうち、学生の店でいくつ開く？",
    bases: [{ fact: 0, value: 65 }],
    knobs: [
      { id: "teams", label: "店を開く学生の組", unit: "組", min: 1, max: 30, step: 1, value: 4 },
      { id: "days", label: "1 組が週に開ける日", unit: "日", min: 1, max: 7, step: 1, value: 2 },
    ],
    say: ({ teams, days }) => {
      const open = (teams * days) / 7;
      return `学生 ${teams} 組が 1 店ずつ、週に ${days} 日開けると、1 日あたり 約 ${n(open, 1)} 店舗が開く。空き店舗 65 の ${pct(open, 65)}`;
    },
  },
  field1: {
    ask: "手放したい 62 ha と引き受けたい 18 ha の差を、学生でどれだけ受け持てる？",
    bases: [
      { fact: 0, value: 62 },
      { fact: 0, value: 18 },
    ],
    knobs: [
      { id: "people", label: "通う学生", unit: "人", min: 1, max: 50, step: 1, value: 10 },
      { id: "area", label: "1 人が受け持てる畑", unit: "a", min: 1, max: 50, step: 1, value: 10 },
    ],
    say: ({ people, area }) => {
      const gap = 62 - 18;
      const ha = (people * area) / 100;
      return `学生 ${people} 人が 1 人 ${area} a ずつ受け持つと ${n(ha, 1)} ha。差の ${gap} ha の ${pct(ha, gap)}。差を全部埋めるには ${n(Math.ceil((gap * 100) / area))} 人`;
    },
  },
  cave: {
    ask: "地区の約 60 a で作る生姜の収穫を、学生でどれだけ手伝える？",
    bases: [{ fact: 0, value: 60 }],
    knobs: [
      { id: "people", label: "手伝う学生", unit: "人", min: 1, max: 30, step: 1, value: 6 },
      { id: "days", label: "1 人が来る日数", unit: "日", min: 1, max: 10, step: 1, value: 2 },
      { id: "area", label: "1 人が 1 日に掘れる広さ", unit: "a", min: 0.5, max: 10, step: 0.5, value: 2 },
    ],
    say: ({ people, days, area }) => {
      const done = people * days * area;
      const head = `学生 ${people} 人が ${days} 日、1 人 1 日 ${n(area, 1)} a 掘ると ${n(done, 1)} a`;
      return done >= 60 ? `${head}。約 60 a を全部掘れる` : `${head}。約 60 a の ${pct(done, 60)}`;
    },
  },
  workshop: {
    ask: "県外への転出超過 266 人のうち何人が残れば、後継者のいない 678 社に届く？",
    bases: [
      { fact: 0, value: 678 },
      { fact: 2, value: 266 },
    ],
    knobs: [
      { id: "stay", label: "県外へ出ずに残る割合", unit: "%", min: 1, max: 100, step: 1, value: 10 },
      { id: "take", label: "残った人のうち会社を継ぐ割合", unit: "%", min: 1, max: 100, step: 1, value: 10 },
    ],
    say: ({ stay, take }) => {
      const perYear = (266 * stay * take) / 10000;
      return `20〜24 歳の転出超過 266 人のうち ${stay}% が残り、その ${take}% が継ぐと、1 年に 約 ${n(perYear, 1)} 人。678 社すべてに届くのに 約 ${n(678 / perYear)} 年`;
    },
  },
  kiosk: {
    ask: "ゴールデンウィークの 1 日、砂丘の売店に人手は何人分要る？",
    bases: [
      { fact: 2, value: 146644 },
      { fact: 2, value: 10 },
    ],
    knobs: [
      { id: "share", label: "売店に寄る人の割合", unit: "%", min: 1, max: 30, step: 1, value: 5 },
      { id: "speed", label: "1 人が 1 時間に受け持つ客", unit: "人", min: 10, max: 60, step: 5, value: 30 },
      { id: "hours", label: "開ける時間", unit: "時間", min: 4, max: 12, step: 1, value: 8 },
    ],
    say: ({ share, speed, hours }) => {
      const day = 146644 / 10;
      const guests = (day * share) / 100;
      return `10 日間の 146,644 人をならすと 1 日 約 ${n(day)} 人。${share}% が寄ると 約 ${n(guests)} 人で、1 人が 1 時間に ${speed} 人を ${hours} 時間受け持つと 約 ${n(guests / (speed * hours), 1)} 人分の人手`;
    },
  },
};

export const defaults = (calc: Calc): Record<string, number> => Object.fromEntries(calc.knobs.map((k) => [k.id, k.value]));
