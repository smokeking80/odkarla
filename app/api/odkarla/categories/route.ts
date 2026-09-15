import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://www.odkarla.cz";

const TEST_CATEGORY =
  "/mobilni-telefony~c731";

type Brand = {
  name: string;
  url: string;
};

function isBrandUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "www.odkarla.cz") {
      return false;
    }

    if (parsed.search || parsed.hash) {
      return false;
    }

    /*
     * Například:
     * /mobilni-telefony-a-apple~c731-b29
     *
     * c731 = kategorie
     * b29 = značka
     */
    return /~c731-b\d+$/.test(
      parsed.pathname
    );
  } catch {
    return false;
  }
}

async function loadBrands(): Promise<Brand[]> {
  const url =
    new URL(
      TEST_CATEGORY,
      BASE_URL
    ).toString();

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

  const brands = new Map<string, Brand>();

  $("a[href]").each((_, element) => {
    const href =
      $(element).attr("href");

    if (!href) {
      return;
    }

    let absoluteUrl: string;

    try {
      absoluteUrl =
        new URL(
          href,
          BASE_URL
        ).toString();
    } catch {
      return;
    }

    if (!isBrandUrl(absoluteUrl)) {
      return;
    }

    const name =
      $(element)
        .text()
        .replace(/\s+/g, " ")
        .trim();

    if (!name) {
      return;
    }

    if (!brands.has(absoluteUrl)) {
      brands.set(
        absoluteUrl,
        {
          name,
          url: absoluteUrl,
        }
      );
    }
  });

  return Array.from(
    brands.values()
  );
}

export async function GET() {
  try {
    const brands =
      await loadBrands();

    return NextResponse.json({
      success: true,
      category:
        new URL(
          TEST_CATEGORY,
          BASE_URL
        ).toString(),
      count: brands.length,
      brands,
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
