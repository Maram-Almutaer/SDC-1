// Instructor helper: injects the flag into order 582 (TARGET_RESOURCE).
// The repo itself never contains the real flag — it lives only in D1 after this runs.
//
// Usage:
//   FLAG='SDC{...}' npm run set-flag            (remote D1)
//   FLAG='SDC{...}' npm run set-flag -- --local  (local D1)
//   node ./scripts/set-flag.mjs --local              (auto-generates a flag if FLAG env missing)
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const local = args.includes("--local");
let flag = process.env.FLAG || "";
if (!flag) {
  flag = `SDC{sahara_582_${randomBytes(4).toString("hex")}}`;
  console.log(`[set-flag] FLAG env missing — generated: ${flag}`);
  console.log(`[set-flag] Save this value for scoring before continuing.`);
}
if (!/^SDC\{[^}]+\}$/.test(flag)) {
  console.error("[set-flag] FLAG must match SDC{...}");
  process.exit(1);
}
// Realistic e-commerce hiding spot: internal warranty code inside order notes.
const notes = `تغليف هدية + بطاقة إهداء. رمز الضمان الداخلي للطلب: ${flag} — يرجى الاحتفاظ به للصيانة.`;
const sql = `UPDATE orders SET notes = '${notes.replace(/'/g, "''")}' WHERE id = 582;`;
const mode = local ? "--local" : "--remote";
console.log(`[set-flag] updating order 582 on D1 (${mode})...`);
execSync(`npx wrangler d1 execute sahara-souq-db ${mode} --command "${sql.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
console.log("[set-flag] done. Verify: open /orders/582 as another user.");
