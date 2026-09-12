import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "@/lib/db";

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
  const keyword = (body.keyword ?? "").toString().trim();
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

  const result = await sql`
    INSERT INTO watches (keyword, max_price)
    VALUES (${keyword}, ${maxPrice})
    RETURNING id, keyword, max_price, created_at;
  `;

  return NextResponse.json(result.rows[0], { status: 201 });
}
