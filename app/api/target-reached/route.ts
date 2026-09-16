import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSchema();

  const result = await sql`
    SELECT
      found_items.id,
      found_items.watch_id,
      found_items.product_url,
      found_items.name,
      found_items.first_price,
      found_items.last_price,
      found_items.first_seen_at,
      found_items.watch_price,
      found_items.target_price,
      found_items.target_reached_at,
      watches.keyword
    FROM found_items
    JOIN watches
      ON watches.id = found_items.watch_id
    WHERE found_items.target_price IS NOT NULL
      AND found_items.target_reached_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM deleted_items
        WHERE deleted_items.watch_id = found_items.watch_id
          AND deleted_items.product_url = found_items.product_url
      )
    ORDER BY found_items.target_reached_at DESC;
  `;

  return NextResponse.json(result.rows);
}
