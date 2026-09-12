import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../lib/db";
import { scoreProduct } from "../../../../../lib/scraper";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureSchema();

  const id = parseInt(params.id, 10);

  if (Number.isNaN(id)) {
    return NextResponse.json(
      { error: "Neplatné id." },
      { status: 400 }
    );
  }

  const result = await sql`
    SELECT
      found_items.id,
      found_items.product_url,
      found_items.name,
      found_items.first_price,
      found_items.last_price,
      found_items.first_seen_at,
      found_items.last_checked_at,
      found_items.last_notified_at,
      watches.keyword
    FROM found_items
    JOIN watches
      ON watches.id = found_items.watch_id
    WHERE found_items.watch_id = ${id};
  `;

  const items = result.rows.map((item) => ({
    ...item,
    relevance_score: scoreProduct(
      item.name as string,
      item.keyword as string
    ),
  }));

  items.sort((a, b) => {
    // 1. Nejdřív relevance
    if (b.relevance_score !== a.relevance_score) {
      return b.relevance_score - a.relevance_score;
    }

    // 2. Při stejné relevanci nejdražší první
    const priceA = a.last_price as number | null;
    const priceB = b.last_price as number | null;

    if (priceA === null && priceB === null) {
      return 0;
    }

    if (priceA === null) {
      return 1;
    }

    if (priceB === null) {
      return -1;
    }

    return priceB - priceA;
  });

  return NextResponse.json(items);
}
