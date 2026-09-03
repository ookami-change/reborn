import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Box, DetectionRun } from "@/lib/types";

/* 表结构对应 TRD §2.1。三张核心表的分离原则见 TRD §2.2：
 * problem（题目身份）/ attempt（每次作答）/ mistake_card（复习状态）必须分开，
 * 掌握状态要能由 attempt 序列推导，不能是唯一事实来源。 */

export const child = pgTable("child", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  grade: integer("grade").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 一次拍摄事件 */
export const capture = pgTable(
  "capture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => child.id),
    imageKey: text("image_key").notNull(),
    /** 'homework' | 'exam' | 'review_redo' */
    sourceType: text("source_type").notNull(),
    reviewSheetId: uuid("review_sheet_id"),
    /** 是否已完成圈题 */
    marked: boolean("marked").notNull().default(false),
    /** 自动切题的原始输出（含家长没采纳的框）。检出关闭或失败时为 null。
     *  这是训练/评测检出模型的唯一数据来源，别只存被采纳的框。 */
    detectedBoxes: jsonb("detected_boxes").$type<DetectionRun>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("capture_pending_idx").on(t.childId, t.marked, t.createdAt)],
);

/** 一道题的身份。裁剪图必填，题干文本可空（v0.1 不做 OCR） */
export const problem = pgTable(
  "problem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => child.id),
    sourceCaptureId: uuid("source_capture_id").notNull().references(() => capture.id),
    /** 归一化坐标，相对原图 */
    cropBox: jsonb("crop_box").$type<Box>().notNull(),
    cropImageKey: text("crop_image_key").notNull(),
    /** 归一化坐标，相对裁剪图。只存坐标，不改图片文件（TRD §5.1） */
    maskBoxes: jsonb("mask_boxes").$type<Box[]>().notNull().default([]),
    /** 'detected' = 采纳了模型给的框，'manual' = 家长自己画的（即模型漏检） */
    boxOrigin: text("box_origin").notNull().default("manual"),
    /** detected 的框是否被家长改过尺寸/位置 */
    boxAdjusted: boolean("box_adjusted").notNull().default(false),
    correctAnswer: text("correct_answer").notNull(),
    stemText: text("stem_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("problem_child_idx").on(t.childId, t.createdAt)],
);

/** 一次作答。同一道题可有多条，绝不覆盖（PRD FR-3） */
export const attempt = pgTable(
  "attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
    captureId: uuid("capture_id").references(() => capture.id),
    childAnswer: text("child_answer"),
    /** 'right' | 'wrong' | 'blank' | 'unclear' */
    verdict: text("verdict").notNull(),
    /** 'manual' | 'model' —— 输入层三级自动化的唯一区别就在这里（TRD §1.1） */
    source: text("source").notNull(),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempt_problem_idx").on(t.problemId, t.createdAt)],
);

/** 复习调度单位，与 problem 一对一 */
export const mistakeCard = pgTable(
  "mistake_card",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id").notNull().unique().references(() => problem.id, { onDelete: "cascade" }),
    childId: uuid("child_id").notNull().references(() => child.id),
    /** Leitner 档位 1..5 */
    boxLevel: integer("box_level").notNull().default(1),
    /** mastered 时为 null */
    nextDueDate: date("next_due_date"),
    consecutiveCorrect: integer("consecutive_correct").notNull().default(0),
    /** 'learning' | 'mastered' */
    status: text("status").notNull().default("learning"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("card_due_idx").on(t.childId, t.status, t.nextDueDate)],
);

export type SheetItem = { seq: number; problemId: string; code: string };

export const reviewSheet = pgTable(
  "review_sheet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => child.id),
    /** 'R07'，印在卷面上用于回收 */
    shortCode: text("short_code").notNull(),
    /** 题目与顺序持久化，保证同一张卷可重复生成完全相同的 PDF（PRD FR-5） */
    itemOrder: jsonb("item_order").$type<SheetItem[]>().notNull(),
    perPage: integer("per_page").notNull().default(5),
    withAnswerPage: boolean("with_answer_page").notNull().default(true),
    pdfKey: text("pdf_key"),
    /** 'generated' | 'collected' */
    status: text("status").notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sheet_code_idx").on(t.shortCode)],
);
