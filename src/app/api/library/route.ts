import { listLibrary } from "@/lib/db";

export async function GET() {
  const rows = listLibrary().map((r) => ({ ...r, authors: JSON.parse(r.authors) }));
  return Response.json({ books: rows });
}
