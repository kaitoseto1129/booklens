import { notFound } from "next/navigation";
import { getBook, bumpViews, getLibraryStatus } from "@/lib/db";
import BookView from "@/components/BookView";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  const { id } = await params;
  const book = getBook(id);
  if (!book) notFound();
  bumpViews(id);
  return <BookView id={id} initialLibraryStatus={getLibraryStatus(id)} />;
}
