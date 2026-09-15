import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://www.odkarla.cz";

const TEST_CATEGORIES = [
  "/elektro~c659",
  "/mobily-telefony-voip~c664",
  "/mobilni-telefony~c731",
];

type Category = {
  name: string;
  url: string;
};

function isRealCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "www.odkarla.cz") {
      return false;
    }

    if (!/~c\d+(?:-b\d+)?$/.test(parsed.pathname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function loadCategory(
  path: string
): Promise<Category[]> {
  const url = new URL(path, BASE_URL).toString();

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

  const categories = new Map<string, Category>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    let absoluteUrl: string;

    try {
      absoluteUrl = new URL(
        href,
        BASE_URL
      ).toString();
    } catch {
      return;
    }

    if (!isRealCategoryUrl(absoluteUrl)) {
      return;
    }

    const name = $(element)
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!name) {
      return;
    }

    if (!categories.has(absoluteUrl)) {
      categories.set(absoluteUrl, {
        name,
        url: absoluteUrl,
      });
    }
  });

  return Array.from(categories.values());
}

export async function GET() {
  try {
    const results: Record<string, unknown>[] = [];

    for (const path of TEST_CATEGORIES) {
      try {
        const categories =
          await loadCategory(path);

        results.push({
          source: new URL(
            path,
            BASE_URL
          ).toString(),
          count: categories.length,
          categories,
        });
      } catch (error) {
        results.push({
          source: new URL(
            path,
            BASE_URL
          ).toString(),
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
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
