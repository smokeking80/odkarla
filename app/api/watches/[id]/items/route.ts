import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../lib/db";
import { scoreProduct } from "../../../../../lib/scraper";

type ItemRow = {
  id: number;
  product_url: string;
  name: string;
  first_price: number | null;
  last_price: number | null;
  first_seen_at: string;
  last_checked_at: string;
  last_notified_at: string | null;
watch_price: boolean;
keyword: string;
};

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
  found_items.watch_id,
  found_items.product_url,
  found_items.name,
      found_items.first_price,
      found_items.last_price,
      found_items.first_seen_at,
      found_items.last_checked_at,
      found_items.last_notified_at,
found_items.watch_price,
watches.keyword
    FROM found_items
    JOIN watches
      ON watches.id = found_items.watch_id
    WHERE found_items.watch_id = ${id};
  `;

  const items = result.rows as ItemRow[];

  items.sort((a, b) => {
    // 1. Nejdřív relevance produktu
    const scoreA = scoreProduct(
      a.name,
      a.keyword
    );

    const scoreB = scoreProduct(
      b.name,
      b.keyword
    );

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // 2. Při stejné relevanci nejdražší první
    const priceA = a.last_price;
    const priceB = b.last_price;

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
