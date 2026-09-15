import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Category = {
  name: string;
  url: string;
  children: Category[];
};

const BASE_URL = "https://www.odkarla.cz/";

function absoluteUrl(href: string): string {
  return new URL(href, BASE_URL).toString();
}

function isCategoryUrl(url: string): boolean {
  return /~c\d+(?:-b\d+)?(?:$|[?#])/.test(url);
}

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function extractCategories(
  html: string
): Category[] {
  const $ = cheerio.load(html);

  const map = new Map<string, Category>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) return;

    let url: string;

    try {
      url = absoluteUrl(href);
    } catch {
      return;
    }

    if (!isCategoryUrl(url)) return;

    const name = cleanName(
      $(element)
        .clone()
        .find("script, style")
        .remove()
        .end()
        .text()
    );

    if (!name) return;

    /*
     * OdKarla používá stejné kategorie
     * na více místech stránky.
     *
     * Uložíme každou URL pouze jednou.
     */
    if (!map.has(url)) {
      map.set(url, {
        name,
        url,
        children: [],
      });
    }
  });

  return Array.from(map.values());
}

function buildTree(
  categories: Category[]
): Category[] {
  const byUrl = new Map<string, Category>();

for (const category of categories) {
  byUrl.set(category.url, {
    ...category,
    children: [],
  });
}

  const result: Category[] = [];

  for (const category of categories) {
    const current = byUrl.get(category.url);

    if (!current) continue;

    /*
     * Z URL se pokusíme určit nadřazenou kategorii.
     *
     * Například:
     * /mobilni-telefony-a-apple~c731-b29
     *
     * patří pod:
     * /mobilni-telefony~c731
     */
    const match = category.url.match(
      /^(.*~c\d+)(?:-b\d+)?$/
    );

    if (!match) {
      result.push(current);
      continue;
    }

    const parentUrl = match[1];

    if (
      parentUrl !== category.url &&
      byUrl.has(parentUrl)
    ) {
      byUrl.get(parentUrl)!.children.push(current);
    } else {
      result.push(current);
    }
  }

  return result;
}

export async function GET() {
  try {
    const response = await fetch(
      BASE_URL,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `OdKarla odpověděla HTTP ${response.status}`
      );
    }

    const html = await response.text();

    const categories =
      extractCategories(html);

    const tree = buildTree(categories);

    return NextResponse.json({
      success: true,
      count: categories.length,
      categories: tree,
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
