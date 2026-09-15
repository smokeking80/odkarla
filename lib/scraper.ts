export type ScrapedProduct = {
  url: string;
  name: string;
  price: number | null;
  brand: string | null;
  model: string | null;
  ean: string | null;
  asin: string | null;
  category: string | null;
};

type LuigiHit = {
  url?: string;
  attributes?: {
    title?: string;
    original_url?: string;
    price_amount?: number;
    brand?: string[];
    Model?: string[];
    EAN?: string[];
    ASIN?: string[];
    category?: string[];
    all_categories?: string[];
  };
};

type LuigiResponse = {
  results?: {
    hits?: LuigiHit[];
    total_hits?: number;
    facets?: unknown[];
  };
  next_page?: number | null;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createSearchSlug(keyword: string): string {
  return normalizeText(keyword)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSearchUrl(
  template: string,
  keyword: string
): string {
  const slug = createSearchSlug(keyword);

  return template
    .replace(
      "{query}",
      encodeURIComponent(keyword)
    )
    .replace(
      "{slug}",
      slug
    );
}

export function scoreProduct(
  productName: string,
  keyword: string
): number {
  const name = normalizeText(productName);
  const query = normalizeText(keyword);

  if (!query) {
    return 0;
  }

  const queryWords = query
    .split(" ")
    .filter(Boolean);

  let score = 0;

  if (name.includes(query)) {
    score += 50;
  }

  for (const word of queryWords) {
    if (name.includes(word)) {
      score += 20;
    }
  }

  const mainProductWords = [
    "telefon",
    "mobil",
    "smartphone",
    "tablet",
    "notebook",
    "pocitac",
    "televize",
    "monitor",
    "hodinky",
    "sluchatka",
    "vysavac",
    "mixer",
    "robot",
    "gril",
    "kavovar",
    "fotoaparat",
    "kamera",
    "drone",
    "dron",
    "konzole",
  ];

  for (const word of mainProductWords) {
    if (name.includes(word)) {
      score += 15;
    }
  }

  const accessoryWords = [
    "pouzdro",
    "obal",
    "kryt",
    "folie",
    "sklo",
    "kabel",
    "nabijecka",
    "adapter",
    "napajeci",
    "drzak",
    "stojanek",
    "filtr",
    "kartac",
    "hadice",
    "trubice",
    "hubice",
    "sacek",
    "sacky",
    "nahradni",
    "nahradni dil",
    "dil",
    "nadoba",
    "vicko",
    "reminek",
    "pasek",
    "baterie",
    "akumulator",
    "sitko",
    "tesneni",
  ];

  const userWantsAccessory =
    accessoryWords.some((word) =>
      query.includes(word)
    );

  if (!userWantsAccessory) {
    for (const word of accessoryWords) {
      if (name.includes(word)) {
        score -= 30;
      }
    }
  }

  return score;
}

function getFirstString(
  value: unknown
): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const first = value.find(
    (item) =>
      typeof item === "string" &&
      item.trim() !== ""
  );

  return first
    ? String(first).trim()
    : null;
}

function getPrice(
  value: unknown
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/\s/g, "")
      .replace(",", ".");

    const number = Number(cleaned);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function convertHit(
  hit: LuigiHit
): ScrapedProduct | null {
  const attributes =
    hit.attributes ?? {};

  const name =
    attributes.title?.trim() ??
    "";

  const url =
    attributes.original_url?.trim() ??
    hit.url?.trim() ??
    "";

  if (!name || !url) {
    return null;
  }

  const category =
    getFirstString(
      attributes.category
    ) ??
    (
      Array.isArray(
        attributes.all_categories
      )
        ? attributes.all_categories.join(
            " → "
          )
        : null
    );

  return {
    url,
    name,
    price: getPrice(
      attributes.price_amount
    ),
    brand: getFirstString(
      attributes.brand
    ),
    model: getFirstString(
      attributes.Model
    ),
    ean: getFirstString(
      attributes.EAN
    ),
    asin: getFirstString(
      attributes.ASIN
    ),
    category,
  };
}

function buildLuigiBoxUrl(
  keyword: string
): string {
  const url =
    new URL(
      "https://live.luigisbox.tech/search"
    );

  url.searchParams.set(
    "tracker_id",
    "224905-260203"
  );

  url.searchParams.set(
    "q",
    keyword
  );

  url.searchParams.append(
    "f[]",
    "type:item"
  );

  url.searchParams.append(
    "f[]",
    "availability:1"
  );

  const normalizedKeyword =
    normalizeText(keyword);

  if (
    normalizedKeyword.includes(
      "iphone"
    )
  ) {
    url.searchParams.append(
      "f[]",
      "category:Mobilní telefony"
    );

    url.searchParams.append(
      "f[]",
      "brand:Apple"
    );
  }

  url.searchParams.set(
    "facets",
    "price_amount,category,brand,labels,availability_source"
  );

  url.searchParams.set(
    "size",
    "96"
  );

  return url.toString();
}

async function fetchLuigiBox(
  url: string
): Promise<LuigiResponse> {
  const response = await fetch(
    url,
    {
      headers: {
        Accept:
          "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `LuigiBox odpověděl HTTP ${response.status}`
    );
  }

  return response.json();
}

export async function scrapeSearchPage(
  _url: string,
  keyword: string
): Promise<ScrapedProduct[]> {
  const searchUrl =
    buildLuigiBoxUrl(keyword);

  console.error(
    `LUIGISBOX DEBUG: hledám "${keyword}"`
  );

  console.error(
    `LUIGISBOX DEBUG: URL ${searchUrl}`
  );

  const data =
    await fetchLuigiBox(searchUrl);

  const hits =
    data.results?.hits ?? [];

  console.error(
    `LUIGISBOX DEBUG: celkem výsledků=${data.results?.total_hits ?? 0}`
  );

  console.error(
    `LUIGISBOX DEBUG: stažených produktů=${hits.length}`
  );

  const products: ScrapedProduct[] = [];

  for (const hit of hits) {
    const product =
      convertHit(hit);

    if (!product) {
      continue;
    }

    products.push(product);

    console.error(
      `LUIGISBOX PRODUKT: ${product.name} | ${
        product.price ?? "?"
      } Kč`
    );
  }

  const uniqueProducts =
    new Map<string, ScrapedProduct>();

  for (const product of products) {
    if (
      !uniqueProducts.has(
        product.url
      )
    ) {
      uniqueProducts.set(
        product.url,
        product
      );
    }
  }

  const uniqueList =
    Array.from(
      uniqueProducts.values()
    );

  uniqueList.sort(
    (a, b) =>
      scoreProduct(
        b.name,
        keyword
      ) -
      scoreProduct(
        a.name,
        keyword
      )
  );

  console.error(
    `LUIGISBOX DEBUG: unikátních produktů=${uniqueList.length}`
  );

  return uniqueList;
}
