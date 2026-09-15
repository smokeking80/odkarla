import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Category = {
  name: string;
  url: string;
  children: Category[];
};

const BASE_URL = "https://www.odkarla.cz";

const ROOT_CATEGORIES = [
  "/elektro~c659",
  "/auto-moto~c660",
  "/obleceni-moda~c661",
  "/dum-zahrada~c974",
  "/sport~c663",
  "/detske-zbozi~c665",
  "/hobby~c666",
  "/knihy-zabava-media~c667",
  "/drogerie-pece-o-telo~c668",
  "/bile-zbozi~c669",
  "/sberatelstvi~c670",
  "/nezarazene~c671",
];

function absoluteUrl(href: string): string {
  return new URL(href, BASE_URL).toString();
}

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function isCategoryUrl(url: string): boolean {
  return /~c\d+(?:-b\d+)?(?:$|[?#])/.test(url);
}

function categoryId(url: string): string | null {
  const match = url.match(
    /~c(\d+)(?:-b\d+)?(?:$|[?#])/
  );

  return match ? match[1] : null;
}

async function fetchPage(
  url: string
): Promise<string> {
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
      `OdKarla odpověděla HTTP ${response.status} pro ${url}`
    );
  }

  return response.text();
}

function extractCategories(
  html: string,
  parentUrl: string
): Category[] {
  const $ = cheerio.load(html);

  const parentId = categoryId(parentUrl);

  if (!parentId) {
    return [];
  }

  const result = new Map<string, Category>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) return;

    let url: string;

    try {
      url = absoluteUrl(href);
    } catch {
      return;
    }

    if (!isCategoryUrl(url)) {
      return;
    }

    /*
     * Zajímá nás pouze odkaz na jinou kategorii.
     *
     * URL stejné kategorie ignorujeme.
     */
    if (url === absoluteUrl(parentUrl)) {
      return;
    }

    const childId = categoryId(url);

    if (!childId || childId === parentId) {
      return;
    }

    const name = cleanName(
      $(element)
        .clone()
        .find("script, style")
        .remove()
        .end()
        .text()
    );

    if (!name) {
      return;
    }

    if (!result.has(url)) {
      result.set(url, {
        name,
        url,
        children: [],
      });
    }
  });

  return Array.from(result.values());
}

async function crawlCategory(
  url: string,
  visited: Set<string>,
  depth: number
): Promise<Category> {
  if (visited.has(url)) {
    return {
      name: url,
      url,
      children: [],
    };
  }

  visited.add(url);

  const html = await fetchPage(url);

  const $ = cheerio.load(html);

  const heading =
    cleanName(
      $("h1")
        .first()
        .text()
    ) || url;

  /*
   * Nejdříve získáme odkazy na podkategorie.
   */
  const children =
    extractCategories(
      html,
      url
    );

  /*
   * Abychom při prvním testu neudělali
   * stovky požadavků, omezíme hloubku.
   *
   * Jakmile ověříme, že struktura funguje,
   * můžeme limit bezpečně zvýšit.
   */
  if (depth >= 4) {
    return {
      name: heading,
      url,
      children: [],
    };
  }

  const crawledChildren: Category[] = [];

  for (const child of children) {
    if (visited.has(child.url)) {
      continue;
    }

    try {
      const fullChild =
        await crawlCategory(
          child.url,
          visited,
          depth + 1
        );

      crawledChildren.push(
        fullChild
      );
    } catch (error) {
      console.error(
        `Kategorie ${child.url} se nepodařila načíst:`,
        error
      );

      crawledChildren.push(child);
    }
  }

  return {
    name: heading,
    url,
    children: crawledChildren,
  };
}

export async function GET() {
  try {
    const visited = new Set<string>();

    const categories: Category[] = [];

    for (const path of ROOT_CATEGORIES) {
      const url =
        absoluteUrl(path);

      try {
        const category =
          await crawlCategory(
            url,
            visited,
            0
          );

        categories.push(category);
      } catch (error) {
        console.error(
          `Hlavní kategorie ${url} se nepodařila načíst:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error(
      "Načtení kategorií OdKarla selhalo:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
