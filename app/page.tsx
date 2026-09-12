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
  watch_id: number;
  product_url: string;
  name: string;
  first_price: number | null;
  last_price: number | null;
  first_seen_at: string;
};

function WatchCard({
  watch,
  onDeleted,
}: {
  watch: Watch;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);

  async function toggle() {
    if (!open && items === null) {
      const res = await fetch(
        `/api/watches/${watch.id}/items`
      );

      if (!res.ok) {
        setItems([]);
      } else {
        setItems(await res.json());
      }
    }

    setOpen(!open);
  }

  async function remove() {
    if (
      !confirm(
        `Smazat hlídání "${watch.keyword}"?`
      )
    ) {
      return;
    }

    await fetch(
      `/api/watches/${watch.id}`,
      {
        method: "DELETE",
      }
    );

    onDeleted();
  }

  const allItems = items ?? [];

  const underTarget =
    watch.max_price !== null
      ? allItems.filter(
          (item) =>
            item.last_price !== null &&
            item.last_price <= watch.max_price!
        )
      : allItems;

  const overTarget =
    watch.max_price !== null
      ? allItems.filter(
          (item) =>
            item.last_price === null ||
            item.last_price > watch.max_price!
        )
      : [];

  return (
    <div className="watch-card">
      <div className="watch-header">
        <div>
          <h3>{watch.keyword}</h3>

          <div className="watch-meta">
            {watch.max_price !== null
              ? `cíl: do ${watch.max_price} Kč · `
              : ""}

            {watch.item_count} nalezených položek
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
          }}
        >
          <button
            className="secondary"
            onClick={toggle}
          >
            {open ? "Skrýt" : "Zobrazit"}
          </button>

          <button
            className="secondary"
            onClick={remove}
          >
            Smazat
          </button>
        </div>
      </div>

      {open && (
        <div className="items">
          {items === null ? (
            <p className="empty">
              Načítám výsledky…
            </p>
          ) : items.length === 0 ? (
            <p className="empty">
              Zatím nic nenalezeno.
            </p>
          ) : watch.max_price === null ? (
            /*
             * Pokud není nastavená cílová cena,
             * zobrazíme všechny produkty normálně.
             */
            <div>
              <div className="items-title">
                Všechny nalezené položky
              </div>

              {allItems.map((item) => (
                <ProductItem
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          ) : (
            /*
             * Pokud je nastavená cílová cena,
             * rozdělíme produkty na dvě skupiny.
             */
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 24,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  🟢 Do {watch.max_price} Kč
                </div>

                {underTarget.length === 0 ? (
                  <p className="empty">
                    Zatím žádná položka pod cílovou cenou.
                  </p>
                ) : (
                  underTarget.map((item) => (
                    <ProductItem
                      key={item.id}
                      item={item}
                      targetPrice={watch.max_price}
                    />
                  ))
                )}
              </div>

              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  🟠 Nad {watch.max_price} Kč
                </div>

                {overTarget.length === 0 ? (
                  <p className="empty">
                    Žádná položka nad cílovou cenou.
                  </p>
                ) : (
                  overTarget.map((item) => (
                    <ProductItem
  key={item.id}
  item={item}
  targetPrice={watch.max_price}
  onRemoved={(itemId) => {
    setItems((current) =>
      current
        ? current.filter(
            (product) => product.id !== itemId
          )
        : current
    );
  }}
/>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductItem({
  item,
  targetPrice,
  onRemoved,
}: {
  item: Item;
  targetPrice?: number | null;
  onRemoved: (itemId: number) => void;
}) {
  const currentPrice = item.last_price;

  const newlyUnderTarget =
    targetPrice !== undefined &&
    targetPrice !== null &&
    item.first_price !== null &&
    item.first_price > targetPrice &&
    currentPrice !== null &&
    currentPrice <= targetPrice;

  const priceDropped =
    item.first_price !== null &&
    currentPrice !== null &&
    currentPrice < item.first_price;

  return (
    <div
      className="item"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <a
          href={item.product_url}
          target="_blank"
          rel="noreferrer"
        >
          {item.name}
        </a>

        {newlyUnderTarget && (
          <div
            style={{
              fontSize: 13,
              marginTop: 4,
            }}
          >
            🔥 Nově pod cílovou cenou
          </div>
        )}

        {!newlyUnderTarget &&
          priceDropped && (
            <div
              style={{
                fontSize: 13,
                marginTop: 4,
              }}
            >
              📉 Zlevnilo
            </div>
          )}
      </div>

      <span className="price">
        {currentPrice !== null
          ? `${currentPrice} Kč`
          : "Cena neznámá"}
      </span>
    </div>
  );
}

export default function Home() {
  const [watches, setWatches] = useState<Watch[]>(
    []
  );

  const [keyword, setKeyword] =
    useState("");

  const [maxPrice, setMaxPrice] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [adding, setAdding] =
    useState(false);

  async function load() {
    setLoading(true);

    try {
      const res = await fetch(
        "/api/watches",
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          "Nepodařilo se načíst hlídání."
        );
      }

      setWatches(await res.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addWatch(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!keyword.trim()) {
      return;
    }

    setAdding(true);

    try {
      const res = await fetch(
        "/api/watches",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            keyword,
            max_price:
              maxPrice || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();

        alert(
          data.error ||
            "Nepodařilo se přidat hlídání."
        );

        return;
      }

      setKeyword("");
      setMaxPrice("");

      /*
       * API už při POSTu provede první
       * vyhledávání na OdKarla.
       *
       * Proto po návratu pouze znovu
       * načteme seznam hlídání.
       */
      await load();
    } catch (error) {
      console.error(error);

      alert(
        "Nepodařilo se přidat hlídání."
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <main>
      <h1>OdKarla hlídač</h1>

      <p className="subtitle">
        Přidej hledaný výraz nebo kategorii.
        Až se na OdKarla.cz objeví nová
        odpovídající položka, nebo zlevní
        stávající, přijde ti zpráva na
        Telegram.
      </p>

      <form
        className="add-watch"
        onSubmit={addWatch}
      >
        <input
          name="keyword"
          placeholder="Hledaný výraz, např. zvlhčovač"
          value={keyword}
          onChange={(e) =>
            setKeyword(e.target.value)
          }
          disabled={adding}
        />

        <input
          name="max_price"
          type="number"
          min="0"
          placeholder="Cílová cena (Kč, volitelné)"
          value={maxPrice}
          onChange={(e) =>
            setMaxPrice(e.target.value)
          }
          disabled={adding}
        />

        <button
          type="submit"
          disabled={adding}
        >
          {adding
            ? "Vyhledávám…"
            : "Přidat hlídání"}
        </button>
      </form>

      {loading ? (
        <p className="empty">
          Načítám…
        </p>
      ) : watches.length === 0 ? (
        <p className="empty">
          Zatím nemáš žádné hlídání.
        </p>
      ) : (
        watches.map((watch) => (
          <WatchCard
            key={watch.id}
            watch={watch}
            onDeleted={load}
          />
        ))
      )}
    </main>
  );
}
