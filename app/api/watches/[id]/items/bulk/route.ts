import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../../lib/db";

export async function DELETE(
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

  let body: { item_ids?: unknown };

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

  /*
   * Nejdříve ověříme, které vybrané položky
   * skutečně patří do tohoto hlídání.
   *
   * Nepoužíváme PostgreSQL ANY s JavaScript polem,
   * protože @vercel/postgres v této verzi typování
   * takový parametr nepřijímá.
   */
  const items = [];

  for (const itemId of uniqueItemIds) {
    const result = await sql`
      SELECT id, product_url
      FROM found_items
      WHERE watch_id = ${watchId}
        AND id = ${itemId};
    `;

    if ((result.rowCount ?? 0) > 0) {
      items.push(result.rows[0]);
    }
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Vybrané položky nebyly nalezeny." },
      { status: 404 }
    );
  }

  /*
   * Stejně jako u běžného mazání uložíme URL
   * do deleted_items, aby se ručně smazané položky
   * při dalším scanu znovu neobjevily.
   */
  for (const item of items) {
    await sql`
      INSERT INTO deleted_items
        (watch_id, product_url)
      VALUES
        (${watchId}, ${item.product_url})
      ON CONFLICT (watch_id, product_url)
      DO NOTHING;
    `;

    await sql`
      DELETE FROM found_items
      WHERE watch_id = ${watchId}
        AND id = ${item.id};
    `;
  }

  return NextResponse.json({
    success: true,
    deleted: items.length,
  });
}
