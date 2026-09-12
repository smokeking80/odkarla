import { NextRequest, NextResponse } from "next/server";

// Chrání jen dashboard (stránku "/"), API /api/scan má vlastní ochranu
// přes CRON_SECRET. Pokud BASIC_AUTH_USER/PASS nejsou nastavené, nic se
// nekontroluje (dashboard bude veřejně dostupný na tvé vercel.app adrese).
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  if (auth === expected) return NextResponse.next();

  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OdKarla hlidac"' },
  });
}

export const config = {
  matcher: ["/"],
};
