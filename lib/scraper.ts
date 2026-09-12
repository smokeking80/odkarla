```ts
import * as cheerio from "cheerio";

export type ScrapedProduct = {
  url: string;
  name: string;
  price: number | null;
};

const BASE_URL = "https://www.odkarla.cz";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function parsePrice(text: string): number | null {
  // Odstraníme NBSP a běžné mezery
  const normalized = text.replace(/\u00a0/g, " ");

  // Např.:
  // 1 299 Kč
  // 1299 Kč
  // 1 299,00 Kč
  const match = normalized.match(/(\d[\d\s]*)(?:,\d{1,2})?\s*Kč/i);

  if (!match) return null;

  const value = parseInt(match[1].replace(/\s/g, ""), 10);

  return Number.isFinite(value) ? value : null;
}

function normalizeUrl(href: string): string | null {
  try {
    const url = new URL(href, BASE_URL);

    // Povolit pouze OdKarla
    if (url.hostname !== "www.odkarla.cz" && url.hostname !== "odkarla.cz") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function scrapeSearchPage(
  url: string
): Promise<ScrapedProduct[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Fetch ${url} selhal se stavem ${res.status}`);
  }

  const html = await res.text();

  if (!html) {
    throw new Error("OdKarla vrátil prázdnou HTML stránku.");
  }

  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  /*
   * Nejprve hledáme odkazy na produkty.
   *
   * Původní scraper spoléhal pouze na:
   *
   *   a[href*="~p"]
   *
   * To může přestat fungovat, pokud OdKarla změní URL produktu.
   *
   * Proto projdeme všechny odkazy a jako produkt bereme ty,
   * které vypadají jako produktová stránka.
   */
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) return;

    const absoluteUrl = normalizeUrl(href);

    if (!absoluteUrl) return;

    const pathname = new URL(absoluteUrl).pathname;

    // Aktuální i starší formát produktových URL.
    const looksLikeProduct =
      /~p\d+/i.test(href) ||
      /\/produkt\//i.test(pathname) ||
      /\/p\//i.test(pathname);

    if (!looksLikeProduct) return;

    if (seen.has(absoluteUrl)) return;

    /*
     * Produktová karta bývá rodičem odkazu.
     * Projdeme několik úrovní nahoru a zkusíme najít
     * smysluplný název + cenu.
     */
    let card = $(el);
    let bestName = "";
    let bestPrice: number | null = null;

    for (let level = 0; level < 6; level++) {
      if (!card.length) break;

      const text = card.text().replace(/\s+/g, " ").trim();

      const title =
        $(el).attr("title")?.trim() ||
        $(el).find("[title]").first().attr("title")?.trim() ||
        "";

      /*
       * Název:
       * - title atribut
       * - alt obrázku
       * - text odkazu
       */
      if (!bestName) {
        const imageAlt = $(el).find("img[alt]").first().attr("alt")?.trim();

        const linkText = $(el).clone().children().remove().end().text().trim();

        bestName = title || imageAlt || linkText || "";
      }

      if (bestPrice === null) {
        bestPrice = parsePrice(text);
      }

      /*
       * Pokud už máme název i cenu, není potřeba
       * lézt dále do DOM.
       */
      if (bestName && bestPrice !== null) break;

      card = card.parent();
    }

    /*
     * Fallback: text celého odkazu.
     */
    if (!bestName) {
      bestName = $(el).text().replace(/\s+/g, " ").trim();
    }

    if (!bestName) return;

    /*
     * Odfiltrujeme odkazy, které sice vypadají jako produkt,
     * ale nemají žádný rozumný text.
     */
    if (bestName.length < 2) return;

    seen.add(absoluteUrl);

    products.push({
      url: absoluteUrl,
      name: bestName,
      price: bestPrice,
    });
  });

  return products;
}

export function buildSearchUrl(
  template: string,
  keyword: string
): string {
  return template.replace("{query}", encodeURIComponent(keyword.trim()));
}
```
