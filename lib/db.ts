import { sql } from "@vercel/postgres";

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS watches (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL,
      max_price INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS found_items (
      id SERIAL PRIMARY KEY,
      watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      product_url TEXT NOT NULL,
      name TEXT NOT NULL,
      first_price INTEGER,
      last_price INTEGER,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_notified_at TIMESTAMPTZ,
      UNIQUE (watch_id, product_url)
    );
  `;
  
  await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS watch_price BOOLEAN NOT NULL DEFAULT false;
`;

await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS brand TEXT;
`;

await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS model TEXT;
`;

await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS ean TEXT;
`;

await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS asin TEXT;
`;

await sql`
  ALTER TABLE found_items
  ADD COLUMN IF NOT EXISTS category TEXT;
`;

  await sql`
  CREATE TABLE IF NOT EXISTS deleted_items (
    id SERIAL PRIMARY KEY,
    watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
    product_url TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (watch_id, product_url)
  );
`;
  initialized = true;
}

export type Watch = {
  id: number;
  keyword: string;
  max_price: number | null;
  created_at: string;
};

export type FoundItem = {
  id: number;
  watch_id: number;
  product_url: string;
  name: string;
  first_price: number | null;
  last_price: number | null;
  first_seen_at: string;
  last_checked_at: string;
  last_notified_at: string | null;
};
