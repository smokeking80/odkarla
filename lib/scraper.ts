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
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/(\d[\d\s]*)\s*Kč/i);

  if (!match) {
    return null;
  }

  const value = parseInt(
    match[1].replace(/\s/g, ""),
    10
  );

  return Number.isFinite(value) ? value : null;
}

function normalizeUrl(href: string): string | null {
  try {
    const url = new URL(href, BASE_URL);

    if (
      url.hostname !== "www.odkarla.cz" &&
      url.hostname !== "odkarla.cz"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(
  productName: string,
  keyword: string
): boolean {
  const normalizedName = normalizeText(productName);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  const words = normalizedKeyword
    .split(" ")
    .filter(Boolean);

  /*
   * KAŽDÉ SLOVO MUSÍ BÝT PŘÍMO V NÁZVU PRODUKTU.
   *
   * iphone
   * -> "Pouzdro pro iPhone 15"       ano
   * -> "Tabletové pero Bopomofo"     ne
   *
   * ninja blast
   * -> "Ninja Blast přenosný mixér"  ano
   * -> "Ninja mixér"                 ne
   */

  return words.every((word) =>
    normalizedName.includes(word)
  );
}

export async function scrapeSearchPage(
  url: string,
  keyword: string
): Promise<ScrapedProduct[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Fetch ${url} selhal. HTTP ${res.status}`
    );
  }

  const html = await res.text();

  if (!html) {
    throw new Error(
      `OdKarla vrátilo prázdné HTML. URL: ${url}`
    );
  }

  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  $('a[href*="~p"]').each((_, el) => {
    const href = $(el).attr("href");

    if (!href) {
      return;
    }

    if (!/~p\d+/i.test(href)) {
      return;
    }

    const absoluteUrl = normalizeUrl(href);

    if (!absoluteUrl) {
      return;
    }

    if (seen.has(absoluteUrl)) {
      return;
    }

    let node = $(el);
    let name = "";
    let price: number | null = null;

    /*
     * Nejprve zkusíme samotný odkaz.
     * Na OdKarla bývá název produktu právě zde.
     */
    const title =
      $(el)
        .attr("title")
        ?.replace(/\s+/g, " ")
        .trim() ?? "";

    const imageAlt =
      $(el)
        .find("img[alt]")
        .first()
        .attr("alt")
        ?.replace(/\s+/g, " ")
        .trim() ?? "";

    const linkText =
      $(el)
        .text()
        .replace(/\s+/g, " ")
        .trim();

    name =
      title ||
      imageAlt ||
      linkText;

    /*
     * Pokud odkaz sám název nemá,
     * hledáme heading v jeho rodičích.
     */
    for (let i = 0; i < 6; i++) {
      if (!node.length) {
        break;
      }

      if (!name) {
        const heading =
          node
            .find("h1, h2, h3, h4, h5, h6")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();

        if (heading) {
          name = heading;
        }
      }

      if (price === null) {
        const text = node
          .text()
          .replace(/\s+/g, " ")
          .trim();

        price = parsePrice(text);
      }

      if (name && price !== null) {
        break;
      }

      node = node.parent();
    }

    name = name
      .replace(/\s+/g, " ")
      .trim();

    if (!name || name.length < 2) {
      return;
    }

    /*
     * TADY JE HLAVNÍ OPRAVA:
     *
     * Kontrolujeme pouze název produktu.
     * Ne celou kartu.
     */
    if (!matchesKeyword(name, keyword)) {
      return;
    }

    seen.add(absoluteUrl);

    products.push({
      url: absoluteUrl,
      name,
      price,
    });
  });

  return products;
}

export function buildSearchUrl(
  template: string,
  keyword: string
): string {
  return template.replace(
    "{query}",
    encodeURIComponent(keyword.trim())
  );
}
