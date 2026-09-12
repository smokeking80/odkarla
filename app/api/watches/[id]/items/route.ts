import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureSchema();
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Neplatné id." }, { status: 400 });
  }

  const items = await sql`
    SELECT id, product_url, name, first_price, last_price,
           first_seen_at, last_checked_at, last_notified_at
    FROM found_items
    WHERE watch_id = ${id}
    ORDER BY last_checked_at DESC;
  `;

  return NextResponse.json(items.rows);
}
