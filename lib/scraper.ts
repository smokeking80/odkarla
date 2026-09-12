import * as cheerio from "cheerio";

export type ScrapedProduct = {
  url: string;
  name: string;
  price: number | null;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(productName: string, keyword: string): boolean {
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

/**
 * Slova, která typicky označují příslušenství.
 *
 * Použijí se pouze tehdy, když samotný hledaný výraz
 * není hledáním příslušenství.
 */
const ACCESSORY_WORDS = [
  "pouzdro",
  "pouzdra",
  "kryt",
  "kryty",
  "obal",
  "obaly",
  "sklo",
  "folie",
  "fólie",
  "ochranne sklo",
  "ochranna folie",
  "ochranné sklo",
  "ochranná fólie",
  "drzak",
  "držák",
  "drzaky",
  "držáky",
  "kabel",
  "kabely",
  "nabijecka",
  "nabíječka",
  "nabijecky",
  "nabíječky",
  "adapter",
  "adaptér",
  "adaptery",
  "adaptéry",
  "stylus",
  "pero",
  "selfie tyc",
  "selfie tyč",
  "stojan",
  "stojany",
  "dock",
  "dokovaci",
  "dokovací",
  "powerbanka",
  "powerbanky",
  "baterie",
  "reminek",
  "řemínek",
  "reminky",
  "řemínky",
  "prislusenstvi",
  "příslušenství",
];

function containsAccessoryWord(name: string): boolean {
  const normalizedName = normalizeText(name);

  return ACCESSORY_WORDS.some((word) => {
    const normalizedWord = normalizeText(word);

    return normalizedName.includes(normalizedWord);
  });
}

/**
 * Pokud uživatel hledá přímo příslušenství,
 * nesmíme ho odfiltrovat.
 *
 * Například:
 *   "iphone kabel"
 *   "iphone pouzdro"
 *   "samsung nabijecka"
 */
function keywordIsAccessorySearch(keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);

  return ACCESSORY_WORDS.some((word) => {
    const normalizedWord = normalizeText(word);

    return normalizedKeyword.includes(normalizedWord);
  });
}

function extractProductName(
  $: cheerio.CheerioAPI,
  element: cheerio.Element
): string {
  const link = $(element);

  const title = link.attr("title")?.trim();
  if (title) {
    return title;
  }

  const imageAlt = link
    .find("img[alt]")
    .first()
    .attr("alt")
    ?.trim();

  if (imageAlt) {
    return imageAlt;
  }

  const linkText = link
    .clone()
    .find("script, style")
    .remove()
    .end()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (linkText) {
    return linkText;
  }

  const parent = link.parent();

  const heading = parent
    .find("h1, h2, h3, h4, h5, h6")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  if (heading) {
    return heading;
  }

  return "";
}

function extractPrice(text: string): number | null {
  const match = text.match(
    /(\d[\d\s]*)\s*Kč/i
  );

  if (!match) {
    return null;
  }

  const number = match[1]
    .replace(/\s/g, "")
    .replace(",", ".");

  const price = Number(number);

  return Number.isFinite(price)
    ? price
    : null;
}

export function buildSearchUrl(
  template: string,
  keyword: string
): string {
  return template.replace(
    "{query}",
    encodeURIComponent(keyword)
  );
}

export async function scrapeSearchPage(
  url: string,
  keyword: string
): Promise<ScrapedProduct[]> {
  const response = await fetch(url, {
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

  const products: ScrapedProduct[] = [];

  const accessorySearch =
    keywordIsAccessorySearch(keyword);

  $('a[href*="~p"]').each((_, element) => {
    const link = $(element);
    const href = link.attr("href");

    if (!href) return;

    const absoluteUrl = new URL(
      href,
      url
    ).toString();

    const name = extractProductName(
      $,
      element
    );

    if (!name) return;

    // Nejdříve musí odpovídat hledanému výrazu.
    if (!matchesKeyword(name, keyword)) {
      return;
    }

    // Pokud uživatel hledá příslušenství,
    // necháme příslušenství normálně projít.
    //
    // Např. "iphone kabel" -> kabely NEVYŘAZUJEME.
    //
    // Pokud ale hledá samotný telefon,
    // vyřadíme typické příslušenství.
    if (
      !accessorySearch &&
      containsAccessoryWord(name)
    ) {
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
    });
  });

  // OdKarla může některé produkty vrátit vícekrát
  // přes různé odkazy. Odstraníme duplicity podle URL.
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

  return Array.from(uniqueProducts.values());
}
