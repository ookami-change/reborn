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

/* 一个家庭一个 account（T9b）。
 *
 * 登录方式是 magic link：每个家庭一条不可猜的长随机串链接，点开即绑定会话，
 * 零注册摩擦、天然数据隔离、不用短信也不用密码（《试用分发方案》§六）。
 * 代价是链接被转发出去等于账号泄露——5–10 个家庭的试用范围内可接受。 */
export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 家庭标识，只给我自己看，如「小明家」 */
  name: text("name").notNull(),
  /** magic link 的随机串。撤销一个家庭的访问 = 改掉它 */
  joinToken: text("join_token").notNull().unique(),
  /** owner 账号走口令登录，其余走 magic link */
  isOwner: boolean("is_owner").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** 软删除（T7）。合规要求可删除，且要能恢复误删 */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 监护人同意记录（T7）。出事时这是唯一证据，所以只增不改。 */
export const consentLog = pgTable("consent_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => account.id),
  /** 'agree' | 'withdraw' */
  action: text("action").notNull(),
  /** 协议版本，改了条款要能区分谁同意的是哪一版 */
  policyVersion: text("policy_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const child = pgTable("child", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 数据隔离的根。所有查询都必须经由 child 收敛到 account（TRD §3.0） */
  accountId: uuid("account_id").references(() => account.id),
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
    /** 原图保存期限（T7）。到期后由清理任务删除对象存储里的文件 */
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
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
    /** 可为空。正确答案对主闭环不是必需的——生成 PDF 要的是题图和遮罩，
     *  扫码判对错家长对着原卷判，Leitner 状态机根本不碰它。之前设成必填，
     *  等于逼家长在最不耐烦的时刻逐题打字（痛点§二）。 */
    correctAnswer: text("correct_answer").notNull().default(""),
    stemText: text("stem_text"),
    /** 软删除（T7）。家长删错题不物理删除，保留可恢复 */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    /** 'R07'，印在卷面上。**只在同一个孩子内唯一**——多账号下全局唯一会撞键，
     *  而且按短码全局查找是越权入口，查询必须带 childId（TRD §3.0） */
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
  (t) => [uniqueIndex("sheet_code_idx").on(t.childId, t.shortCode)],
);
