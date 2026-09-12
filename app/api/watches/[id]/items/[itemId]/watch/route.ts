import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../../../../lib/db";

export async function PATCH(
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

  const result = await sql`
    UPDATE found_items
    SET watch_price = NOT watch_price
    WHERE id = ${itemId}
      AND watch_id = ${watchId}
    RETURNING id, watch_price;
  `;

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "Položka nebyla nalezena." },
      { status: 404 }
    );
  }

  console.log(
  "WATCH PRICE UPDATE:",
  result.rows[0]
);

return NextResponse.json({
  success: true,
  watch_price: result.rows[0].watch_price,
});
}
