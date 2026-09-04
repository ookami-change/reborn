-- 按家庭隔离数据（T9b）+ 合规字段（T7）
--
-- deploy.sh 每次部署都重跑 drizzle/*.sql，所以必须幂等。

CREATE TABLE IF NOT EXISTS "account" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"         text NOT NULL,
  "join_token"   text NOT NULL UNIQUE,
  "is_owner"     boolean NOT NULL DEFAULT false,
  "last_seen_at" timestamptz,
  "deleted_at"   timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "consent_log" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"     uuid NOT NULL REFERENCES "account"("id"),
  "action"         text NOT NULL,
  "policy_version" text NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "child"   ADD COLUMN IF NOT EXISTS "account_id"      uuid REFERENCES "account"("id");
ALTER TABLE "capture" ADD COLUMN IF NOT EXISTS "retention_until" timestamptz;
ALTER TABLE "problem" ADD COLUMN IF NOT EXISTS "deleted_at"      timestamptz;

-- 已有数据全部归到 owner 账号，否则升级后自己家的数据会看不见
INSERT INTO "account" ("name", "join_token", "is_owner")
SELECT '我家', 'owner-' || gen_random_uuid(), true
WHERE NOT EXISTS (SELECT 1 FROM "account" WHERE "is_owner");

UPDATE "child" SET "account_id" = (SELECT "id" FROM "account" WHERE "is_owner" LIMIT 1)
WHERE "account_id" IS NULL;

-- 短码只在同一个孩子内唯一。全局唯一在多账号下会撞键：
-- 每个孩子的第一张卷都叫 R01。
DROP INDEX IF EXISTS "sheet_code_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "sheet_code_idx" ON "review_sheet" ("child_id", "short_code");
