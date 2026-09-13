import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../../lib/db";

export async function DELETE(
  _req: NextRequest,
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

  /*
   * Nejprve zjistíme URL produktu.
   */
  const item = await sql`
    SELECT product_url
    FROM found_items
    WHERE id = ${itemId}
      AND watch_id = ${watchId};
  `;

  if (item.rowCount === 0) {
    return NextResponse.json(
      { error: "Položka nebyla nalezena." },
      { status: 404 }
    );
  }

  const productUrl = item.rows[0].product_url;

  /*
   * Zapamatujeme si, že uživatel tento produkt
   * pro toto hlídání ručně smazal.
   */
  await sql`
    INSERT INTO deleted_items
      (watch_id, product_url)
    VALUES
      (${watchId}, ${productUrl})
    ON CONFLICT (watch_id, product_url)
    DO NOTHING;
  `;

  /*
   * Teprve potom produkt odstraníme z nalezených položek.
   */
  await sql`
    DELETE FROM found_items
    WHERE id = ${itemId}
      AND watch_id = ${watchId};
  `;

  return NextResponse.json({
    success: true,
  });
}
