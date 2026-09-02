import { loadEnv, tcCall } from "./tc3.mjs";
const env = loadEnv();
const pg = { secretId: env.TENCENT_SECRET_ID, secretKey: env.TENCENT_SECRET_KEY,
             service: "postgres", host: "postgres.tencentcloudapi.com", version: "2017-03-12", region: "ap-shanghai" };

for (const [spec, storage] of [["pg.it.small2", 20], ["pg.it.medium4", 20]]) {
  for (const charge of ["PREPAID", "POSTPAID_BY_HOUR"]) {
    const payload = { Zone: "ap-shanghai-5", SpecCode: spec, Storage: storage,
                      InstanceCount: 1, Period: 1, InstanceChargeType: charge };
    const r = await tcCall({ ...pg, action: "InquiryPriceCreateDBInstances", payload });
    const R = r.Response;
    if (R?.Error) { console.log(`✗ ${spec} ${charge}: ${R.Error.Code} ${R.Error.Message}`.slice(0,140)); continue; }
    const unit = charge === "PREPAID" ? "元/月" : "元/小时";
    const div  = charge === "PREPAID" ? 100 : 100;
    console.log(`✓ ${spec.padEnd(16)} ${storage}GB ${charge.padEnd(18)} 原价 ${R.OriginalPrice/div} → 实付 ${R.Price/div} ${unit}`);
  }
}
