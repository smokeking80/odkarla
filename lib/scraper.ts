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

type LuigiQuickSearchHit = {
  type?: string;
  url?: string;
  attributes?: {
    title?: string;
    name?: string;
  };
};

type LuigiResponse = {
  results?: {
    hits?: LuigiHit[];
    total_hits?: number;
    facets?: unknown[];
    quicksearch_hits?:
      | LuigiQuickSearchHit[]
      | Record<string, LuigiQuickSearchHit[]>;
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

function getLastString(
  value: unknown
): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter(
    (item) =>
      typeof item === "string" &&
      item.trim() !== ""
  );

  if (strings.length === 0) {
    return null;
  }

  return String(
    strings[strings.length - 1]
  ).trim();
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
    getLastString(
      attributes.category
    ) ??
    getLastString(
      attributes.all_categories
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
  keyword: string,
  filters: string[] = [],
  includeQuickSearch = false
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

  for (const filter of filters) {
    url.searchParams.append(
      "f[]",
      filter
    );
  }

  if (includeQuickSearch) {
    url.searchParams.set(
      "quicksearch_types",
      "category,brand"
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

function getQuickSearchHits(
  data: LuigiResponse
): LuigiQuickSearchHit[] {
  const value =
    data.results?.quicksearch_hits;

  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const result: LuigiQuickSearchHit[] = [];

    for (const entry of Object.values(value)) {
      if (Array.isArray(entry)) {
        result.push(...entry);
      }
    }

    return result;
  }

  return [];
}

function getQuickSearchTitle(
  hit: LuigiQuickSearchHit
): string | null {
  const title =
    hit.attributes?.title ??
    hit.attributes?.name ??
    "";

  return title.trim() || null;
}

function findCategory(
  keyword: string,
  products: ScrapedProduct[],
  data: LuigiResponse
): string | null {
  const quickHits =
    getQuickSearchHits(data);

  const quickCategories =
    quickHits
      .filter(
        (hit) =>
          !hit.type ||
          normalizeText(hit.type) ===
            "category"
      )
      .map(getQuickSearchTitle)
      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      );

  const categoryScores =
    new Map<string, number>();

  const relevantProducts =
    products
      .slice(0, 24)
      .map((product) => ({
        product,
        score: Math.max(
          1,
          scoreProduct(
            product.name,
            keyword
          )
        ),
      }));

  for (const {
    product,
    score,
  } of relevantProducts) {
    if (!product.category) {
      continue;
    }

    const category =
      product.category.trim();

    if (!category) {
      continue;
    }

    categoryScores.set(
      category,
      (categoryScores.get(category) ?? 0) +
        score
    );
  }

  if (
    quickCategories.length > 0
  ) {
    const matchingQuick =
      quickCategories
        .filter((category) =>
          categoryScores.has(category)
        )
        .sort(
          (a, b) =>
            (categoryScores.get(b) ?? 0) -
            (categoryScores.get(a) ?? 0)
        );

    if (matchingQuick.length > 0) {
      return matchingQuick[0];
    }

    return quickCategories[0];
  }

  if (categoryScores.size === 0) {
    return null;
  }

  const sorted =
    Array.from(
      categoryScores.entries()
    ).sort(
      (a, b) => b[1] - a[1]
    );

  const top = sorted[0];
  const second = sorted[1];

  if (
    !second ||
    top[1] >= second[1] * 1.15
  ) {
    return top[0];
  }

  return null;
}

function findBrand(
  keyword: string,
  products: ScrapedProduct[],
  data: LuigiResponse
): string | null {
  const normalizedKeyword =
    normalizeText(keyword);

  const quickHits =
    getQuickSearchHits(data);

  const quickBrands =
    quickHits
      .filter(
        (hit) =>
          !hit.type ||
          normalizeText(hit.type) ===
            "brand"
      )
      .map(getQuickSearchTitle)
      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      );

  for (const brand of quickBrands) {
    const normalizedBrand =
      normalizeText(brand);

    if (
      normalizedBrand &&
      normalizedKeyword.includes(
        normalizedBrand
      )
    ) {
      return brand;
    }
  }

  const brandScores =
    new Map<string, number>();

  const relevantProducts =
    products
      .slice(0, 24)
      .map((product) => ({
        product,
        score: Math.max(
          1,
          scoreProduct(
            product.name,
            keyword
          )
        ),
      }));

  for (const {
    product,
    score,
  } of relevantProducts) {
    if (!product.brand) {
      continue;
    }

    const brand =
      product.brand.trim();

    if (!brand) {
      continue;
    }

    brandScores.set(
      brand,
      (brandScores.get(brand) ?? 0) +
        score
    );
  }

  if (brandScores.size === 0) {
    return null;
  }

  const sorted =
    Array.from(
      brandScores.entries()
    ).sort(
      (a, b) => b[1] - a[1]
    );

  const top = sorted[0];
  const second = sorted[1];

  if (
    top[1] >= 60 &&
    (!second ||
      top[1] >= second[1] * 1.8)
  ) {
    return top[0];
  }

  return null;
}

function prepareProducts(
  data: LuigiResponse,
  keyword: string
): ScrapedProduct[] {
  const hits =
    data.results?.hits ?? [];

  const products: ScrapedProduct[] = [];

  for (const hit of hits) {
    const product =
      convertHit(hit);

    if (!product) {
      continue;
    }

    products.push(product);
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

  return uniqueList;
}

export async function scrapeSearchPage(
  _url: string,
  keyword: string
): Promise<ScrapedProduct[]> {
  console.error(
    `LUIGISBOX DEBUG: hledám "${keyword}"`
  );

  /*
   * 1. fáze:
   * Nejdřív necháme LuigiBox vrátit běžné
   * produkty + rychlé výsledky kategorií
   * a výrobců.
   */
  const discoveryUrl =
    buildLuigiBoxUrl(
      keyword,
      [],
      true
    );

  console.error(
    `LUIGISBOX DISCOVERY URL: ${discoveryUrl}`
  );

  const discoveryData =
    await fetchLuigiBox(
      discoveryUrl
    );

  const discoveryProducts =
    prepareProducts(
      discoveryData,
      keyword
    );

  console.error(
    `LUIGISBOX DISCOVERY: výsledků=${
      discoveryData.results
        ?.total_hits ?? 0
    }`
  );

  console.error(
    `LUIGISBOX DISCOVERY: produktů=${
      discoveryProducts.length
    }`
  );

  /*
   * 2. fáze:
   * Z výsledků automaticky odhadneme
   * nejvhodnější kategorii a výrobce.
   */
  const category =
    findCategory(
      keyword,
      discoveryProducts,
      discoveryData
    );

  const brand =
    findBrand(
      keyword,
      discoveryProducts,
      discoveryData
    );

  console.error(
    `LUIGISBOX FILTER: category=${
      category ?? "-"
    } | brand=${
      brand ?? "-"
    }`
  );

  const filters: string[] = [];

  if (category) {
    filters.push(
      `category:${category}`
    );
  }

  if (brand) {
    filters.push(
      `brand:${brand}`
    );
  }

  /*
   * Pokud jsme nic rozumného nezjistili,
   * použijeme rovnou výsledky první fáze.
   */
  if (filters.length === 0) {
    console.error(
      "LUIGISBOX: žádný přesný filtr nebyl nalezen."
    );

    for (const product of discoveryProducts) {
      console.error(
        `LUIGISBOX PRODUKT: ${
          product.name
        } | ${
          product.price ?? "?"
        } Kč`
      );
    }

    return discoveryProducts;
  }

  /*
   * 3. fáze:
   * Provedeme druhý, přesnější dotaz
   * s automaticky nalezenými filtry.
   */
  const filteredUrl =
    buildLuigiBoxUrl(
      keyword,
      filters,
      false
    );

  console.error(
    `LUIGISBOX FILTERED URL: ${filteredUrl}`
  );

  const filteredData =
    await fetchLuigiBox(
      filteredUrl
    );

  const filteredProducts =
    prepareProducts(
      filteredData,
      keyword
    );

  console.error(
    `LUIGISBOX FILTERED: výsledků=${
      filteredData.results
        ?.total_hits ?? 0
    }`
  );

  console.error(
    `LUIGISBOX FILTERED: produktů=${
      filteredProducts.length
    }`
  );

  /*
   * Bezpečnostní pojistka:
   * Pokud příliš přesný filtr vrátí nulu,
   * nevrátíme prázdný výsledek.
   */
  if (
    filteredProducts.length === 0 &&
    discoveryProducts.length > 0
  ) {
    console.error(
      "LUIGISBOX: přesný filtr vrátil 0 produktů, používám výsledky discovery."
    );

    return discoveryProducts;
  }

  for (const product of filteredProducts) {
    console.error(
      `LUIGISBOX PRODUKT: ${
        product.name
      } | ${
        product.price ?? "?"
      } Kč`
    );
  }

  return filteredProducts;
}
