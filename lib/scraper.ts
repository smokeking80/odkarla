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

  // Např.:
  // 79 Kč
  // od 79 Kč
  // 1 299 Kč
  // 12 999 Kč
  const matches = [
    /(?:od\s+)?(\d[\d\s]*)\s*Kč/i,
    /(\d[\d\s]*)\s*Kč/i,
  ];

  for (const regex of matches) {
    const match = normalized.match(regex);

    if (!match) continue;

    const value = parseInt(
      match[1].replace(/\s/g, ""),
      10
    );

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
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

function extractProductId(url: string): string | null {
  const match = url.match(/~p(\d+)/i);

  if (!match) {
    return null;
  }

  return match[1];
}

function cleanName(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+\(\d+\+\?\)\s*$/, "")
    .trim();
}

export async function scrapeSearchPage(
  url: string
): Promise<ScrapedProduct[]> {
  console.log("ODKARLA URL:", url);

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });

  console.log("ODKARLA STATUS:", res.status);
  console.log(
    "ODKARLA CONTENT-TYPE:",
    res.headers.get("content-type")
  );

  if (!res.ok) {
    throw new Error(
      `Fetch ${url} selhal se stavem ${res.status}`
    );
  }

  const html = await res.text();

  console.log(
    "ODKARLA HTML LENGTH:",
    html.length
  );

  if (!html) {
    throw new Error(
      "OdKarla vrátil prázdnou HTML stránku."
    );
  }

  const $ = cheerio.load(html);

  const allLinks = $("a[href]").length;

  const productLinks = $('a[href*="~p"]').length;

  console.log(
    "ODKARLA ALL LINKS:",
    allLinks
  );

  console.log(
    "ODKARLA PRODUCT LINKS:",
    productLinks
  );

  // Pomocná diagnostika:
  // Pokud OdKarla vrací jinou stránku, uvidíme její začátek v logu.
  console.log(
    "ODKARLA HTML START:",
    html
      .replace(/\s+/g, " ")
      .slice(0, 500)
  );

  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) {
      return;
    }

    const absoluteUrl = normalizeUrl(href);

    if (!absoluteUrl) {
      return;
    }

    const productId = extractProductId(
      absoluteUrl
    );

    if (!productId) {
      return;
    }

    if (seen.has(absoluteUrl)) {
      return;
    }

    let current = $(el);

    let name = "";
    let price: number | null = null;

    // Projdeme několik úrovní DOM nahoru.
    // Produktová karta bývá rodičem odkazu.
    for (let level = 0; level < 8; level++) {
      if (!current.length) {
        break;
      }

      const cardText = current
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (!name) {
        const title =
          $(el)
            .attr("title")
            ?.trim() ?? "";

        const imageAlt =
          $(el)
            .find("img[alt]")
            .first()
            .attr("alt")
            ?.trim() ?? "";

        const heading =
          current
            .find("h1, h2, h3, h4, h5, h6")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();

        const directText =
          $(el)
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .replace(/\s+/g, " ")
            .trim();

        name =
          title ||
          heading ||
          imageAlt ||
          directText;
      }

      if (price === null) {
        price = parsePrice(cardText);
      }

      if (name && price !== null) {
        break;
      }

      current = current.parent();
    }

    // Poslední pokus o získání názvu.
    if (!name) {
      name = $(el)
        .text()
        .replace(/\s+/g, " ")
        .trim();
    }

    name = cleanName(name);

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

  console.log(
    "ODKARLA PRODUCTS FOUND:",
    products.length
  );

  if (products.length > 0) {
    console.log(
      "ODKARLA FIRST PRODUCT:",
      JSON.stringify(products[0])
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
