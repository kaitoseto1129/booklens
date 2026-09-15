import { fetchWikipedia } from "../src/lib/books/wikipedia.ts";
import { db } from "../src/lib/db.ts";

type Row = { id: string; title: string; authors: string; language: string | null };
const rows = db().prepare("select id,title,authors,language from books").all() as Row[];
for (const b of rows) {
  const authors = JSON.parse(b.authors) as string[];
  const isJa = b.language === "jpn" || /[぀-ヿ一-鿿]/.test(b.title);
  const wiki = await fetchWikipedia(b.title, authors[0] ?? null, isJa ? ["ja", "en"] : ["en", "ja"]);
  const ai = wiki.find((w) => w.kind === "author" && w.image)?.image ?? null;
  const ti = wiki.find((w) => w.kind === "book" && w.image)?.image ?? null;
  db().prepare("update books set author_image=?, topic_image=? where id=?").run(ai, ti, b.id);
  console.log(b.title, "-> author:", ai ? "yes" : "no", "topic:", ti ? "yes" : "no");
}
