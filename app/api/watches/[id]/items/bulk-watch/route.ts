import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../../lib/db";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  }
) {
  await ensureSchema();

  const watchId = parseInt(params.id, 10);

  if (Number.isNaN(watchId)) {
    return NextResponse.json(
      { error: "Neplatné id hlídání." },
      { status: 400 }
    );
  }

  let body: {
    item_ids?: unknown;
    watch_price?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatná data." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.item_ids)) {
    return NextResponse.json(
      { error: "Chybí seznam položek." },
      { status: 400 }
    );
  }

  if (typeof body.watch_price !== "boolean") {
    return NextResponse.json(
      { error: "Chybí hodnota watch_price." },
      { status: 400 }
    );
  }

  const itemIds = body.item_ids
    .map((value) =>
      typeof value === "number"
        ? value
        : parseInt(String(value), 10)
    )
    .filter(
      (value) =>
        Number.isInteger(value) &&
        value > 0
    );

  const uniqueItemIds =
    Array.from(new Set(itemIds));

  if (uniqueItemIds.length === 0) {
    return NextResponse.json(
      { error: "Nebyly vybrány žádné položky." },
      { status: 400 }
    );
  }

  let updated = 0;

  for (const itemId of uniqueItemIds) {
    const result = await sql`
      UPDATE found_items
      SET watch_price = ${body.watch_price}
      WHERE id = ${itemId}
        AND watch_id = ${watchId};
    `;

    updated += result.rowCount ?? 0;
  }

  return NextResponse.json({
    success: true,
    updated,
    watch_price: body.watch_price,
  });
}
