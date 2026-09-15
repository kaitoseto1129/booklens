import { getJson } from "./http";

type OpenBD = {
  summary: { isbn: string; title: string; publisher: string; pubdate: string; cover: string; author: string; series?: string };
  onix?: {
    CollateralDetail?: { TextContent?: { TextType: string; Text: string }[] };
    DescriptiveDetail?: { TitleDetail?: { TitleElement?: { TitleText?: { content?: string }; Subtitle?: { content?: string } } } };
  };
};

/** openBD（版元の書誌データ）。紹介文(03)・目次(04)・表紙が取れることがある。 */
export async function fetchOpenBD(isbn13: string) {
  const arr = await getJson<(OpenBD | null)[]>(`https://api.openbd.jp/v1/get?isbn=${isbn13}`);
  const d = arr?.[0];
  if (!d) return null;
  const texts = d.onix?.CollateralDetail?.TextContent ?? [];
  const pick = (type: string) => texts.filter((t) => t.TextType === type).map((t) => t.Text.trim()).join("\n") || null;
  const toc = pick("04");
  return {
    title: d.summary.title,
    subtitle: d.onix?.DescriptiveDetail?.TitleDetail?.TitleElement?.Subtitle?.content ?? null,
    publisher: d.summary.publisher || null,
    year: d.summary.pubdate ? Number(d.summary.pubdate.slice(0, 4)) : null,
    cover: d.summary.cover || null,
    description: pick("03") ?? pick("02"),
    toc: toc ? toc.split(/\n+/).map((s) => s.trim()).filter(Boolean) : null,
    series: d.summary.series ?? null,
  };
}
