import * as cheerio from "cheerio";

export type ScrapedProduct = {
  url: string;
  name: string;
  price: number | null;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; OsobniHlidacZbozi/1.0; +personal-use-price-watcher)";

/**
 * Stáhne jednu stránku výsledků hledání a vrátí seznam produktů.
 *
 * DŮLEŽITÉ: OdKarla.cz běží na platformě Shoptet a přesná HTML struktura
 * (názvy CSS tříd) se může měnit. Proto tenhle parser NEspoléhá na
 * konkrétní třídy, ale na to, že:
 *  - odkaz na produkt vždy obsahuje "~p" následované číslem (to je stabilní
 *    vzor URL adres produktů na Shoptetu),
 *  - cena je v nejbližším bloku textu obsahujícím "Kč".
 *
 * Pokud se v budoucnu parsování rozbije (např. přestanou chodit ceny),
 * je potřeba se podívat do zdrojového kódu stránky (View Page Source)
 * a selektor doladit.
 */
export async function scrapeSearchPage(
  url: string
): Promise<ScrapedProduct[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "cs" },
    // Nikdy neposílat cookies/session, nechceme nic personalizovaného
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Fetch ${url} selhal se stavem ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  $('a[href*="~p"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !/~p\d+/.test(href)) return;

    const absoluteUrl = href.startsWith("http")
      ? href
      : new URL(href, "https://www.odkarla.cz").toString();

    if (seen.has(absoluteUrl)) return;

    const name = $(el).text().trim() || $(el).attr("title")?.trim() || "";
    if (!name) return;

    // Najdi nejbližší obalující blok, který obsahuje cenu v Kč
    let priceText = "";
    let node = $(el);
    for (let i = 0; i < 5 && priceText === ""; i++) {
      node = node.parent();
      if (node.length === 0) break;
      const text = node.text();
      const match = text.match(/(\d[\d\s]*)\s?Kč/);
      if (match) priceText = match[1];
    }

    const price = priceText
      ? parseInt(priceText.replace(/\s/g, ""), 10)
      : null;

    seen.add(absoluteUrl);
    products.push({ url: absoluteUrl, name, price });
  });

  return products;
}

export function buildSearchUrl(template: string, keyword: string): string {
  return template.replace("{query}", encodeURIComponent(keyword));
}
