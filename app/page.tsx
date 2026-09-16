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
  watch_price: boolean;
  target_price: number | null;
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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  async function toggle() {
    if (!open) {
      const res = await fetch(`/api/watches/${watch.id}/items`, {
        cache: "no-store",
      });

      if (!res.ok) {
        setItems([]);
      } else {
        setItems(await res.json());
      }

      setSelectedIds([]);
    }

    setOpen(!open);
  }

  async function remove() {
    if (!confirm(`Smazat hlídání "${watch.keyword}"?`)) {
      return;
    }

    await fetch(`/api/watches/${watch.id}`, {
      method: "DELETE",
    });

    onDeleted();
  }

  function updateItemWatchPrice(itemId: number, watchPrice: boolean) {
    setItems((current) =>
      current
        ? current.map((item) =>
            item.id === itemId
              ? { ...item, watch_price: watchPrice }
              : item
          )
        : current
    );
  }

  function removeItemFromList(itemId: number) {
    setItems((current) =>
      current ? current.filter((item) => item.id !== itemId) : current
    );

    setSelectedIds((current) =>
      current.filter((id) => id !== itemId)
    );
  }

  function toggleSelected(itemId: number) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  }

  async function bulkDelete() {
    if (selectedIds.length === 0 || bulkLoading) {
      return;
    }

    const count = selectedIds.length;

    if (!confirm(`Opravdu odstranit ${count} vybraných položek?`)) {
      return;
    }

    setBulkLoading(true);

    try {
      const res = await fetch(
        `/api/watches/${watch.id}/items/bulk`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            item_ids: selectedIds,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(
          data?.error ||
            "Vybrané položky se nepodařilo odstranit."
        );
        return;
      }

      setItems((current) =>
        current
          ? current.filter(
              (item) => !selectedIds.includes(item.id)
            )
          : current
      );

      setSelectedIds([]);
      await onDeleted();
    } catch (error) {
      console.error(error);
      alert("Vybrané položky se nepodařilo odstranit.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkWatchPrice(watchPrice: boolean) {
    if (selectedIds.length === 0 || bulkLoading) {
      return;
    }

    setBulkLoading(true);

    try {
      const res = await fetch(
        `/api/watches/${watch.id}/items/bulk-watch`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            item_ids: selectedIds,
            watch_price: watchPrice,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(
          data?.error ||
            "Vybraným položkám se nepodařilo změnit hlídání ceny."
        );
        return;
      }

      setItems((current) =>
        current
          ? current.map((item) =>
              selectedIds.includes(item.id)
                ? { ...item, watch_price: watchPrice }
                : item
            )
          : current
      );
    } catch (error) {
      console.error(error);
      alert(
        "Vybraným položkám se nepodařilo změnit hlídání ceny."
      );
    } finally {
      setBulkLoading(false);
    }
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

  const allSelected =
    allItems.length > 0 &&
    selectedIds.length === allItems.length;

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
          {items === null ? (
            <p className="empty">Načítám výsledky…</p>
          ) : items.length === 0 ? (
            <p className="empty">Zatím nic nenalezeno.</p>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 18,
                  paddingBottom: 14,
                  borderBottom:
                    "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds([]);
                      } else {
                        setSelectedIds(
                          allItems.map((item) => item.id)
                        );
                      }
                    }}
                  />
                  Vybrat vše
                </label>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ opacity: 0.75 }}>
                    Vybráno: {selectedIds.length}
                  </span>

                  <button
                    className="secondary"
                    onClick={bulkDelete}
                    disabled={
                      selectedIds.length === 0 ||
                      bulkLoading
                    }
                    style={{
                      opacity:
                        selectedIds.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {bulkLoading
                      ? "Mažu…"
                      : `🗑️ Smazat vybrané${
                          selectedIds.length > 0
                            ? ` (${selectedIds.length})`
                            : ""
                        }`}
                  </button>

                  <button
                    className="secondary"
                    onClick={() => bulkWatchPrice(true)}
                    disabled={
                      selectedIds.length === 0 ||
                      bulkLoading
                    }
                    style={{
                      opacity:
                        selectedIds.length === 0 ? 0.5 : 1,
                    }}
                  >
                    🔔 Zapnout vybrané
                  </button>

                  <button
                    className="secondary"
                    onClick={() => bulkWatchPrice(false)}
                    disabled={
                      selectedIds.length === 0 ||
                      bulkLoading
                    }
                    style={{
                      opacity:
                        selectedIds.length === 0 ? 0.5 : 1,
                    }}
                  >
                    🔕 Vypnout vybrané
                  </button>
                </div>
              </div>

              {watch.max_price === null ? (
                <div>
                  <div className="items-title">
                    Všechny nalezené položky
                  </div>

                  {allItems.map((item) => (
                    <ProductItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.includes(item.id)}
                      onSelected={toggleSelected}
                      onWatchChanged={updateItemWatchPrice}
                      onRemoved={removeItemFromList}
                    />
                  ))}
                </div>
              ) : (
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
                          selected={selectedIds.includes(item.id)}
                          onSelected={toggleSelected}
                          onWatchChanged={updateItemWatchPrice}
                          onRemoved={removeItemFromList}
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
                          selected={selectedIds.includes(item.id)}
                          onSelected={toggleSelected}
                          onWatchChanged={updateItemWatchPrice}
                          onRemoved={removeItemFromList}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
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
  selected,
  onSelected,
  onWatchChanged,
  onRemoved,
}: {
  item: Item;
  targetPrice?: number | null;
  selected: boolean;
  onSelected: (itemId: number) => void;
  onWatchChanged: (
    itemId: number,
    watchPrice: boolean
  ) => void;
  onRemoved: (itemId: number) => void;
}) {
  const currentPrice = item.last_price;
  const [targetPriceInput, setTargetPriceInput] = useState(
  item.target_price !== null
    ? String(item.target_price)
    : ""
);
  const [targetPriceLoading, setTargetPriceLoading] =
    useState(false);

  async function saveTargetPrice() {
    if (targetPriceLoading) {
      return;
    }

    const value = targetPriceInput.trim();

    if (value !== "") {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < 0) {
        alert("Cílová cena není platné číslo.");
        return;
      }
    }

    setTargetPriceLoading(true);

    try {
      const res = await fetch(
        `/api/watches/${item.watch_id}/items/${item.id}/target-price`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target_price:
              value === "" ? null : Number(value),
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(
          data?.error ||
            "Cílovou cenu se nepodařilo uložit."
        );
        return;
      }

      const data = await res.json();

      setTargetPriceInput(
        data.target_price !== null &&
          data.target_price !== undefined
          ? String(data.target_price)
          : ""
      );
    } catch (error) {
      console.error(error);
      alert("Cílovou cenu se nepodařilo uložit.");
    } finally {
      setTargetPriceLoading(false);
    }
  }


  const effectiveTargetPrice =
    item.target_price !== null
      ? item.target_price
      : targetPrice !== undefined &&
          targetPrice !== null
        ? targetPrice
        : null;

  const newlyUnderTarget =
    effectiveTargetPrice !== null &&
    item.first_price !== null &&
    item.first_price > effectiveTargetPrice &&
    currentPrice !== null &&
    currentPrice <= effectiveTargetPrice;

  const priceDropped =
    item.first_price !== null &&
    currentPrice !== null &&
    currentPrice < item.first_price;

  const [watchingLoading, setWatchingLoading] =
    useState(false);

  async function togglePriceWatch() {
    if (watchingLoading) {
      return;
    }

    const desiredWatchPrice = !item.watch_price;
    setWatchingLoading(true);

    try {
      const res = await fetch(
        `/api/watches/${item.watch_id}/items/${item.id}/watch`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            watch_price: desiredWatchPrice,
          }),
        }
      );

      if (!res.ok) {
        alert("Nepodařilo se změnit hlídání ceny.");
        return;
      }

      const data = await res.json();

      onWatchChanged(
        item.id,
        data.watch_price
      );
    } catch (error) {
      console.error(error);
      alert("Nepodařilo se změnit hlídání ceny.");
    } finally {
      setWatchingLoading(false);
    }
  }

  async function removeItem() {
    if (!confirm(`Odstranit položku "${item.name}"?`)) {
      return;
    }

    const res = await fetch(
      `/api/watches/${item.watch_id}/items/${item.id}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      alert("Položku se nepodařilo odstranit.");
      return;
    }

    onRemoved(item.id);
  }

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
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelected(item.id)}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          cursor: "pointer",
        }}
        aria-label={`Vybrat ${item.name}`}
      />

      <div style={{ flex: 1 }}>
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

        {!newlyUnderTarget && priceDropped && (
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <input
          type="number"
          min="0"
          value={targetPriceInput}
          onChange={(e) => setTargetPriceInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              saveTargetPrice();
            }
          }}
          placeholder="Cíl Kč"
          disabled={targetPriceLoading}
          style={{ width: 90 }}
          title="Cílová cena pro tento produkt"
        />

        <button
          className="secondary"
          onClick={saveTargetPrice}
          disabled={targetPriceLoading}
          title="Uložit cílovou cenu"
        >
          {targetPriceLoading ? "…" : "🎯"}
        </button>

        <span className="price">
          {currentPrice !== null
            ? `${currentPrice} Kč`
            : "Cena neznámá"}
        </span>
      </div>

      <button
        className="secondary"
        onClick={togglePriceWatch}
        disabled={watchingLoading}
        title={
          item.watch_price
            ? "Zrušit hlídání ceny"
            : "Zapnout hlídání ceny"
        }
      >
        {watchingLoading
          ? "…"
          : item.watch_price
          ? "🔔"
          : "🔕"}
      </button>

      <button
        className="secondary"
        onClick={removeItem}
        title="Odstranit položku"
      >
        🗑
      </button>
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
