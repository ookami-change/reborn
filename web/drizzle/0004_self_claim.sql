-- 自助领取（《试用分发方案》§六 方案 B）
--
-- deploy.sh 每次部署都重跑 drizzle/*.sql，所以必须幂等。

-- 区分「我手动建的家庭」和「群链接自助领的」。名额满了要清理时，
-- 得先知道哪些是陌生人点出来的空壳账号。
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz;
