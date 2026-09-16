import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../../../lib/db";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
      itemId: string;
    };
  }
) {
  await ensureSchema();

  const watchId = parseInt(params.id, 10);
  const itemId = parseInt(params.itemId, 10);

  if (
    Number.isNaN(watchId) ||
    Number.isNaN(itemId)
  ) {
    return NextResponse.json(
      { error: "Neplatné id." },
      { status: 400 }
    );
  }

  let body: {
    target_price?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data." },
      { status: 400 }
    );
  }

  let targetPrice: number | null = null;

  if (
    body.target_price !== undefined &&
    body.target_price !== null &&
    body.target_price !== ""
  ) {
    targetPrice = parseInt(String(body.target_price), 10);

    if (
      !Number.isFinite(targetPrice) ||
      targetPrice < 0
    ) {
      return NextResponse.json(
        { error: "Cílová cena není platné číslo." },
        { status: 400 }
      );
    }
  }

  const result = await sql`
    UPDATE found_items
    SET target_price = ${targetPrice}
    WHERE id = ${itemId}
      AND watch_id = ${watchId}
    RETURNING id, target_price;
  `;

  if ((result.rowCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "Položka nebyla nalezena." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    target_price: result.rows[0].target_price,
  });
}
