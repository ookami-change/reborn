/* Leitner 状态机验证（PRD FR-4 验收标准） */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
execSync("npx tsc lib/leitner.ts --outDir /tmp/lt --module esnext --target es2022 --moduleResolution bundler", { stdio: "pipe" });
const { initialState, applyAttempt, BOX_INTERVALS } = await import("/tmp/lt/leitner.js");

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     得到 ${JSON.stringify(got)}\n     期望 ${JSON.stringify(want)}`}`);
};
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0,10); };

// 连续答对 5 次 → 已掌握
let c = initialState();
t("新错题进第1档、明天复习", [c.boxLevel, c.nextDueDate, c.status], [1, d(1), "learning"]);
const expect = [[2, d(3)], [3, d(7)], [4, d(14)], [5, d(30)]];
for (const [lvl, due] of expect) {
  c = applyAttempt(c, "right");
  t(`答对 → 第${lvl}档，${BOX_INTERVALS[lvl]}天后`, [c.boxLevel, c.nextDueDate, c.status], [lvl, due, "learning"]);
}
c = applyAttempt(c, "right");
t("第5档再答对 → 已掌握、无下次日期", [c.boxLevel, c.nextDueDate, c.status], [5, null, "mastered"]);

// 中途答错退回第 1 档
let e = initialState();
e = applyAttempt(e, "right");   // 第2档
e = applyAttempt(e, "right");   // 第3档
t("连对两次到第3档", e.boxLevel, 3);
e = applyAttempt(e, "wrong");
t("答错 → 回第1档、明天、连对清零", [e.boxLevel, e.nextDueDate, e.consecutiveCorrect], [1, d(1), 0]);

// 已掌握的题答错要回到学习中
let m = { boxLevel: 5, nextDueDate: null, consecutiveCorrect: 6, status: "mastered" };
m = applyAttempt(m, "wrong");
t("已掌握答错 → 回学习中第1档", [m.boxLevel, m.status, m.nextDueDate], [1, "learning", d(1)]);

console.log(`\n${fail === 0 ? "全部通过" : "有失败"}：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
