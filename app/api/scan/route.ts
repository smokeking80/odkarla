import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema, Watch } from "../../../lib/db";
import { buildSearchUrl, scrapeSearchPage } from "../../../lib/scraper";
import { sendTelegramMessage } from "../../../lib/telegram";

export const maxDuration = 60; // vteřin, ať má scan čas na víc watchů

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) return true;

  const header = req.headers.get("authorization") ?? "";

  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  return runScan(req);
}

// GET taky funguje, ať to jde otestovat rovnou z prohlížeče (s ?secret=...)
export async function GET(req: NextRequest) {
  return runScan(req);
}

async function runScan(req: NextRequest) {
  const secretParam = req.nextUrl.searchParams.get("secret");

  const authorized =
    isAuthorized(req) ||
    (process.env.CRON_SECRET &&
      secretParam === process.env.CRON_SECRET);

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await ensureSchema();

  // Aktuální vyhledávání na OdKarla používá parametr ?q=
  const template =
    process.env.SEARCH_URL_TEMPLATE ??
    "https://www.odkarla.cz/vyhledavani-old?q={query}"

  const watchesRes = await sql`SELECT * FROM watches;`;
  const watches = watchesRes.rows as Watch[];

  const summary: Record<string, unknown>[] = [];

  for (const watch of watches) {
    try {
      const searchUrl = buildSearchUrl(
        template,
        watch.keyword
      );

      const products = await scrapeSearchPage(
  searchUrl,
  watch.keyword
);
      let newCount = 0;
      let priceDropCount = 0;

      for (const product of products) {
        const existing = await sql`
          SELECT * FROM found_items
          WHERE watch_id = ${watch.id}
          AND product_url = ${product.url};
        `;

        if (existing.rowCount === 0) {
          // Nová položka odpovídající hledanému výrazu
          await sql`
            INSERT INTO found_items
              (
                watch_id,
                product_url,
                name,
                first_price,
                last_price,
                last_notified_at
              )
            VALUES
              (
                ${watch.id},
                ${product.url},
                ${product.name},
                ${product.price},
                ${product.price},
                now()
              );
          `;

          const priceOk =
            watch.max_price == null ||
            (product.price != null &&
              product.price <= watch.max_price);

          if (priceOk) {
            newCount++;

            await sendTelegramMessage(
              `🆕 <b>Nová položka</b> pro "${watch.keyword}"\n` +
                `${product.name}\n` +
                `${
                  product.price != null
                    ? product.price + " Kč"
                    : "cena neznámá"
                }\n` +
                `${product.url}`
            );
          }
        } else {
          const row = existing.rows[0];

          const previousPrice =
            row.last_price as number | null;

          await sql`
            UPDATE found_items
            SET
              last_price = ${product.price},
              last_checked_at = now()
            WHERE id = ${row.id};
          `;

          const droppedPrice =
            product.price != null &&
            previousPrice != null &&
            product.price < previousPrice;

          const underTarget =
            watch.max_price == null ||
            (product.price != null &&
              product.price <= watch.max_price);

          if (droppedPrice && underTarget) {
            priceDropCount++;

            await sql`
              UPDATE found_items
              SET last_notified_at = now()
              WHERE id = ${row.id};
            `;

            await sendTelegramMessage(
              `📉 <b>Zlevnilo</b> ("${watch.keyword}")\n` +
                `${product.name}\n` +
                `${previousPrice} Kč → ${product.price} Kč\n` +
                `${product.url}`
            );
          }
        }
      }

      summary.push({
        watch: watch.keyword,
        found: products.length,
        newNotified: newCount,
        priceDropsNotified: priceDropCount,
      });
    } catch (err) {
      console.error(
        `Chyba při scanu watch "${watch.keyword}":`,
        err
      );

      summary.push({
        watch: watch.keyword,
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    summary,
  });
}
