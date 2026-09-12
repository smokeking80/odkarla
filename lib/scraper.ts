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

export async function scrapeSearchPage(
  url: string
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
      `OdKarla vrátil prázdné HTML. URL: ${url}`
    );
  }

  const $ = cheerio.load(html);

  const allLinks = $("a[href]").length;
  const productLinks = $('a[href*="~p"]').length;

  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  $("a[href]").each((_, el) => {
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

    for (let i = 0; i < 8; i++) {
      if (!node.length) {
        break;
      }

      const text = node
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (!price) {
        price = parsePrice(text);
      }

      if (!name) {
        const title =
          $(el).attr("title")?.trim() ?? "";

        const alt =
          $(el)
            .find("img[alt]")
            .first()
            .attr("alt")
            ?.trim() ?? "";

        const heading =
          node
            .find("h1, h2, h3, h4, h5, h6")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();

        const linkText =
          $(el)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        name =
          title ||
          heading ||
          alt ||
          linkText;
      }

      if (name && price !== null) {
        break;
      }

      node = node.parent();
    }

    name = name.replace(/\s+/g, " ").trim();

    if (!name || name.length < 2) {
      return;
    }

    seen.add(absoluteUrl);

    products.push({
      url: absoluteUrl,
      name,
      price,
    });
  });

  /*
   * DŮLEŽITÉ:
   * Pokud OdKarla neposlalo žádné produkty,
   * pošleme diagnostiku přímo do odpovědi /api/scan.
   * Díky tomu ji uvidíme v GitHub Actions.
   */
  if (products.length === 0) {
    const htmlStart = html
      .replace(/\s+/g, " ")
      .slice(0, 800);

    throw new Error(
      [
        "OdKarla nevrátilo žádné produkty.",
        `URL=${url}`,
        `HTTP=${res.status}`,
        `HTML_LENGTH=${html.length}`,
        `ALL_LINKS=${allLinks}`,
        `PRODUCT_LINKS=${productLinks}`,
        `HTML_START=${htmlStart}`,
      ].join(" | ")
    );
  }

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
