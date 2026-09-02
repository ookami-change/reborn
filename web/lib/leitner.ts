/* Leitner 复习调度（PRD FR-4 / TRD §4.1）
 *
 * 5 档盒子，答对进下一档、答错回第 1 档，第 5 档答对即视为掌握。
 * 逾期不做任何惩罚性调整：过了复习日没做的题保持原档位，继续算作到期。
 *
 * 这里是纯函数，不碰数据库——掌握状态必须能由 attempt 序列重算出来，
 * 数据库里的 mistake_card 只是它的物化结果（TRD §2.2）。 */

export const BOX_INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
export const MAX_BOX = 5;

export type CardState = {
  boxLevel: number;
  nextDueDate: string | null;
  consecutiveCorrect: number;
  status: "learning" | "mastered";
};

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 新错题的初始状态：第 1 档，明天复习 */
export function initialState(): CardState {
  return { boxLevel: 1, nextDueDate: addDays(1), consecutiveCorrect: 0, status: "learning" };
}

export function applyAttempt(card: CardState, verdict: "right" | "wrong"): CardState {
  if (verdict === "wrong") {
    return {
      boxLevel: 1,
      nextDueDate: addDays(1),
      consecutiveCorrect: 0,
      // 已掌握的题再答错会回到学习中
      status: "learning",
    };
  }
  if (card.boxLevel >= MAX_BOX) {
    return {
      boxLevel: MAX_BOX,
      nextDueDate: null,
      consecutiveCorrect: card.consecutiveCorrect + 1,
      status: "mastered",
    };
  }
  const next = card.boxLevel + 1;
  return {
    boxLevel: next,
    nextDueDate: addDays(BOX_INTERVALS[next]),
    consecutiveCorrect: card.consecutiveCorrect + 1,
    status: "learning",
  };
}

/** 是否到期（含逾期） */
export const isDue = (card: Pick<CardState, "nextDueDate" | "status">) =>
  card.status === "learning" && !!card.nextDueDate && card.nextDueDate <= today();
