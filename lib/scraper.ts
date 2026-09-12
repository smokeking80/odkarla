import * as cheerio from "cheerio";

export type ScrapedProduct = {
  url: string;
  name: string;
  price: number | null;
  brand: string | null;
  model: string | null;
  ean: string | null;
  asin: string | null;
  category: string | null;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(
  productName: string,
  keyword: string
): boolean {
  const normalizedName = normalizeText(productName);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) return true;

  const words = normalizedKeyword
    .split(" ")
    .filter(Boolean);

  return words.every((word) =>
    normalizedName.includes(word)
  );
}

function extractProductName(
  $: cheerio.CheerioAPI,
  element: cheerio.Element
): string {
  const link = $(element);

  const title = link.attr("title")?.trim();
  if (title) return title;

  const imageAlt = link
    .find("img[alt]")
    .first()
    .attr("alt")
    ?.trim();

  if (imageAlt) return imageAlt;

  const linkText = link
    .clone()
    .find("script, style")
    .remove()
    .end()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (linkText) return linkText;

  const parent = link.parent();

  const heading = parent
    .find("h1, h2, h3, h4, h5, h6")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return heading;
}

function extractPrice(text: string): number | null {
  const match = text.match(
    /(\d[\d\s]*)\s*Kč/i
  );

  if (!match) return null;

  const number = match[1].replace(/\s/g, "");
  const price = Number(number);

  return Number.isFinite(price)
    ? price
    : null;
}

function extractField(
  $: cheerio.CheerioAPI,
  labels: string[]
): string | null {
  const normalizedLabels = labels.map(normalizeText);

  let result: string | null = null;

  $("body *").each((_, element) => {
    if (result) return;

    const text = $(element)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return;

    const normalized = normalizeText(text);

    for (const label of normalizedLabels) {
      if (
        normalized === label ||
        normalized.startsWith(`${label}:`)
      ) {
        const value = text
          .replace(
            new RegExp(
              `^${label}\\s*:\\s*`,
              "i"
            ),
            ""
          )
          .trim();

        if (
          value &&
          normalizeText(value) !== label
        ) {
          result = value;
        }

        return;
      }
    }
  });

  return result;
}

function extractCategory(
  $: cheerio.CheerioAPI
): string | null {
  const candidates: string[] = [];

  $("a[href*='/kategorie/'], a[href*='/category/']").each(
    (_, element) => {
      const text = $(element)
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        candidates.push(text);
      }
    }
  );

  if (candidates.length > 0) {
    return candidates.join(" → ");
  }

  return null;
}

async function scrapeProductDetail(
  productUrl: string
): Promise<{
  brand: string | null;
  model: string | null;
  ean: string | null;
  asin: string | null;
  category: string | null;
}> {
  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `Detail produktu ${productUrl} odpověděl HTTP ${response.status}`
      );

      return {
        brand: null,
        model: null,
        ean: null,
        asin: null,
        category: null,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const bodyText = $("body")
      .text()
      .replace(/\s+/g, " ");

    const brand =
      extractField($, ["Značka", "Brand"]);

    const model =
      extractField($, ["Model"]);

    const ean =
      extractField($, ["EAN"]);

    const asin =
      extractField($, ["ASIN"]);

    const category =
      extractCategory($);

    const eanMatch = bodyText.match(
      /\bEAN\s*:?\s*(\d{8,14})\b/i
    );

    const asinMatch = bodyText.match(
      /\bASIN\s*:?\s*([A-Z0-9]{10})\b/i
    );

    return {
      brand,
      model,
      ean: ean ?? eanMatch?.[1] ?? null,
      asin: asin ?? asinMatch?.[1] ?? null,
      category,
    };
  } catch (error) {
    console.error(
      `Nepodařilo se načíst detail ${productUrl}:`,
      error
    );

    return {
      brand: null,
      model: null,
      ean: null,
      asin: null,
      category: null,
    };
  }
}

function createSearchSlug(
  keyword: string
): string {
  return normalizeText(keyword)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSearchUrl(
  template: string,
  keyword: string
): string {
  const slug = createSearchSlug(keyword);

  return template
    .replace(
      "{query}",
      encodeURIComponent(keyword)
    )
    .replace(
      "{slug}",
      slug
    );
}

export async function scrapeSearchPage(
  url: string,
  keyword: string
): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];

  for (let page = 1; page <= 5; page++) {
    let pageUrl = url;

    if (page > 1) {
      const separator = url.includes("?") ? "&" : "?";
      pageUrl = `${url}${separator}page=${page}`;
    }

    console.error(
      `ODKARLA DEBUG: načítám stránku ${page}: ${pageUrl}`
    );

    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `OdKarla odpověděla HTTP ${response.status}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const productLinks = $('a[href*="~p"]');

    console.error(
      `ODKARLA DEBUG: stránka ${page}, produktových odkazů=${productLinks.length}`
    );

    if (productLinks.length === 0) {
      break;
    }

    productLinks.each((_, element) => {
      const link = $(element);
      const href = link.attr("href");

      if (!href) return;

      const absoluteUrl = new URL(
        href,
        pageUrl
      ).toString();

      const name = extractProductName(
        $,
        element
      );

      if (!name) return;

      if (!matchesKeyword(name, keyword)) {
        return;
      }

      const cardText = link
        .parent()
        .parent()
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const price =
        extractPrice(cardText) ??
        extractPrice(name);

      products.push({
        url: absoluteUrl,
        name,
        price,
        brand: null,
        model: null,
        ean: null,
        asin: null,
        category: null,
      });
    });
  }

  const uniqueProducts =
    new Map<string, ScrapedProduct>();

  for (const product of products) {
    if (!uniqueProducts.has(product.url)) {
      uniqueProducts.set(
        product.url,
        product
      );
    }
  }

  const uniqueList =
    Array.from(uniqueProducts.values());

  console.error(
    `ODKARLA DEBUG: celkem unikátních produktů=${uniqueList.length}`
  );

  for (const product of uniqueList) {
    const details =
      await scrapeProductDetail(
        product.url
      );

    product.brand = details.brand;
    product.model = details.model;
    product.ean = details.ean;
    product.asin = details.asin;
    product.category = details.category;
  }

  return uniqueList;
}
