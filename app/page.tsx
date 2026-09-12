"use client";

import { useEffect, useState } from "react";

type Watch = {
  id: number;
  keyword: string;
  max_price: number | null;
  created_at: string;
  item_count: number;
};

type Item = {
  id: number;
  product_url: string;
  name: string;
  first_price: number | null;
  last_price: number | null;
  first_seen_at: string;
};

function WatchCard({ watch, onDeleted }: { watch: Watch; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);

  async function toggle() {
    if (!open && items === null) {
      const res = await fetch(`/api/watches/${watch.id}/items`);
      setItems(await res.json());
    }
    setOpen(!open);
  }

  async function remove() {
    if (!confirm(`Smazat hlídání "${watch.keyword}"?`)) return;
    await fetch(`/api/watches/${watch.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="watch-card">
      <div className="watch-header">
        <div>
          <h3>{watch.keyword}</h3>
          <div className="watch-meta">
            {watch.max_price ? `cíl: do ${watch.max_price} Kč · ` : ""}
            {watch.item_count} nalezených položek
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={toggle}>
            {open ? "Skrýt" : "Zobrazit"}
          </button>
          <button className="secondary" onClick={remove}>
            Smazat
          </button>
        </div>
      </div>

      {open && (
        <div className="items">
          {items === null || items.length === 0 ? (
            <p className="empty">Zatím nic nenalezeno.</p>
          ) : (
            items.map((it) => (
              <div className="item" key={it.id}>
                <a href={it.product_url} target="_blank" rel="noreferrer">
                  {it.name}
                </a>
                <span className="price">
                  {it.last_price != null ? `${it.last_price} Kč` : "?"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [keyword, setKeyword] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/watches");
    setWatches(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addWatch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    await fetch("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, max_price: maxPrice || null }),
    });
    setKeyword("");
    setMaxPrice("");
    load();
  }

  return (
    <main>
      <h1>OdKarla hlídač</h1>
      <p className="subtitle">
        Přidej hledaný výraz nebo kategorii. Až se na OdKarla.cz objeví nová
        odpovídající položka, nebo zlevní stávající, přijde ti zpráva na
        Telegram.
      </p>

      <form className="add-watch" onSubmit={addWatch}>
        <input
          name="keyword"
          placeholder="Hledaný výraz, např. zvlhčovač"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <input
          name="max_price"
          type="number"
          placeholder="Cílová cena (Kč, volitelné)"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <button type="submit">Přidat hlídání</button>
      </form>

      {loading ? (
        <p className="empty">Načítám…</p>
      ) : watches.length === 0 ? (
        <p className="empty">Zatím nemáš žádné hlídání.</p>
      ) : (
        watches.map((w) => (
          <WatchCard key={w.id} watch={w} onDeleted={load} />
        ))
      )}
    </main>
  );
}
