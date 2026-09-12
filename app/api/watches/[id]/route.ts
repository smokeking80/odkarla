import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "../../../../lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureSchema();
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Neplatné id." }, { status: 400 });
  }

  await sql`DELETE FROM watches WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
