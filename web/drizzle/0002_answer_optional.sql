-- 正确答案改为可选（《痛点与针对性设计》§二）
--
-- 这个字段的 20 处引用全是展示，没有一处参与逻辑判断，却被 schema notNull
-- + 接口 400 + 按钮 disabled 三处联手做成了主流程的必经门槛：圈 5 道错题
-- 要打字 5 次、超过 1 分钟。
--
-- 保留 NOT NULL 但给默认空串：读取侧的 20 处不用处理 null。

ALTER TABLE "problem" ALTER COLUMN "correct_answer" SET DEFAULT '';
