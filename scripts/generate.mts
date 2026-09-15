// スタンドアロンで生成パイプラインを実行（dev サーバーの再起動に影響されない）。
// 使い方: node --experimental-strip-types --env-file=.env.local scripts/generate.mts <bookId>
import { getBook, latestAnalysis } from "../src/lib/db.ts";
import { startAnalysis } from "../src/lib/pipeline.ts";

const id = process.argv[2];
if (!id) { console.error("usage: generate.mts <bookId>"); process.exit(1); }
const book = getBook(id);
if (!book) { console.error("book not found:", id); process.exit(1); }
console.log("generating:", book.title);
startAnalysis(book, true);

const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const a = latestAnalysis(id);
  if (!a) continue;
  const el = Math.round((Date.now() - t0) / 1000);
  process.stdout.write(`\r[${el}s] ${a.status} ${a.step} ${a.progress}%           `);
  if (a.status === "done") {
    console.log("\nDONE");
    const u = a.usage ? JSON.parse(a.usage) : null;
    if (u) {
      const cost = (u.input * 5 + u.cacheWrite * 6.25 + u.cacheRead * 0.5 + u.output * 25) / 1e6;
      console.log(`usage in=${u.input} cacheR=${u.cacheRead} cacheW=${u.cacheWrite} out=${u.output} ~= $${cost.toFixed(2)}`);
    }
    const v = a.visuals ? JSON.parse(a.visuals) : null;
    console.log("visuals:", v ? v.visuals.length : 0);
    process.exit(0);
  }
  if (a.status === "error") { console.log("\nERROR:", a.error); process.exit(1); }
}
