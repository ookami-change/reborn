-- 保留自动切题的训练信号（《痛点与针对性设计》§三）
--
-- 家长每次「采纳模型的框 / 手画模型漏的框 / 拖动模型的框」都是一条免费标注，
-- 之前落库时全部丢弃。这三列把它们留下来。
--
-- deploy.sh 每次部署都会重跑 drizzle/*.sql，所以必须幂等。

ALTER TABLE "capture" ADD COLUMN IF NOT EXISTS "detected_boxes" jsonb;

ALTER TABLE "problem" ADD COLUMN IF NOT EXISTS "box_origin" text NOT NULL DEFAULT 'manual';
ALTER TABLE "problem" ADD COLUMN IF NOT EXISTS "box_adjusted" boolean NOT NULL DEFAULT false;
