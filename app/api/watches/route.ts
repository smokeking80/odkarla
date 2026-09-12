import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../lib/db";
import {
  buildSearchUrl,
  scrapeSearchPage,
} from "../../../lib/scraper";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();

  const watches = await sql`
    SELECT w.id, w.keyword, w.max_price, w.created_at,
           COUNT(f.id)::int AS item_count
    FROM watches w
    LEFT JOIN found_items f ON f.watch_id = w.id
    GROUP BY w.id
    ORDER BY w.created_at DESC;
  `;

  return NextResponse.json(watches.rows);
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = await req.json();

  const keyword = (body.keyword ?? "")
    .toString()
    .trim();

  const maxPrice =
    body.max_price !== undefined &&
    body.max_price !== null &&
    body.max_price !== ""
      ? parseInt(body.max_price, 10)
      : null;

  if (!keyword) {
    return NextResponse.json(
      { error: "Vyplň hledaný výraz." },
      { status: 400 }
    );
  }

  if (
    maxPrice !== null &&
    (!Number.isFinite(maxPrice) || maxPrice < 0)
  ) {
    return NextResponse.json(
      { error: "Cílová cena není platné číslo." },
      { status: 400 }
    );
  }

  /*
   * 1. Vytvoříme nové hlídání.
   */
  const result = await sql`
    INSERT INTO watches (keyword, max_price)
    VALUES (${keyword}, ${maxPrice})
    RETURNING id, keyword, max_price, created_at;
  `;

  const watch = result.rows[0];

  /*
   * 2. Hned po vytvoření provedeme první hledání.
   *
   * Telegram zde schválně NEVOLÁME.
   */
  try {
    const template =
      process.env.SEARCH_URL_TEMPLATE ??
      "https://www.odkarla.cz/{slug}";

    const searchUrl = buildSearchUrl(
      template,
      keyword
    );

    const products = await scrapeSearchPage(
      searchUrl,
      keyword
    );

    /*
     * 3. Uložíme první nalezené produkty
     *    včetně dalších údajů z detailu produktu.
     */
    for (const product of products) {
      await sql`
        INSERT INTO found_items
          (
            watch_id,
            product_url,
            name,
            brand,
            model,
            ean,
            asin,
            category,
            first_price,
            last_price,
            last_notified_at
          )
        VALUES
          (
            ${watch.id},
            ${product.url},
            ${product.name},
            ${product.brand},
            ${product.model},
            ${product.ean},
            ${product.asin},
            ${product.category},
            ${product.price},
            ${product.price},
            NULL
          )
        ON CONFLICT (watch_id, product_url)
        DO NOTHING;
      `;
    }

    /*
     * 4. Vrátíme i počet nalezených produktů.
     */
    return NextResponse.json(
      {
        ...watch,
        item_count: products.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      `První vyhledávání pro "${keyword}" selhalo:`,
      error
    );

    /*
     * Hlídání už existuje, i když první scan selhal.
     * GitHub Action ho může zkusit později znovu.
     */
    return NextResponse.json(
      {
        ...watch,
        item_count: 0,
        scan_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 201 }
    );
  }
}
