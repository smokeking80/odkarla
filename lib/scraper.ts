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

function getCategoryValues(
  hit: LuigiHit
): string[] {
  const attributes =
    hit.attributes ?? {};

  const values = [
    ...(Array.isArray(attributes.category)
      ? attributes.category
      : []),
    ...(Array.isArray(
      attributes.all_categories
    )
      ? attributes.all_categories
      : []),
  ];

  return Array.from(
    new Set(
      values
        .filter(
          (value) =>
            typeof value === "string" &&
            value.trim() !== ""
        )
        .map((value) => value.trim())
    )
  );
}

function removeBrandFromQuery(
  keyword: string,
  brand: string | null
): string {
  if (!brand) {
    return normalizeText(keyword);
  }

  const normalizedBrand =
    normalizeText(brand);

  const words = normalizeText(keyword)
    .split(" ")
    .filter(Boolean);

  const brandWords = normalizedBrand
    .split(" ")
    .filter(Boolean);

  const remaining = [...words];

  for (const brandWord of brandWords) {
    const index =
      remaining.indexOf(
        brandWord
      );

    if (index !== -1) {
      remaining.splice(index, 1);
    }
  }

  return remaining.join(" ").trim();
}

function countWordMatches(
  category: string,
  queryWords: string[]
): number {
  const normalizedCategory =
    normalizeText(category);

  let matches = 0;

  for (const word of queryWords) {
    if (
      word.length >= 3 &&
      normalizedCategory.includes(word)
    ) {
      matches++;
    }
  }

  return matches;
}

function findCategory(
  keyword: string,
  brand: string | null,
  products: ScrapedProduct[],
  data: LuigiResponse
): string | null {
  const categoryQuery =
    removeBrandFromQuery(
      keyword,
      brand
    );

  /*
   * Pokud uživatel zadal pouze značku:
   *
   * Dreo
   * Samsung
   * Lenovo
   *
   * nechceme žádný kategorický filtr.
   */
  if (!categoryQuery) {
    return null;
  }

  const queryWords =
    categoryQuery
      .split(" ")
      .filter(
        (word) => word.length >= 3
      );

  if (queryWords.length === 0) {
    return null;
  }

  /*
   * Jednoduché porovnání českých tvarů.
   *
   * Například:
   *
   * ventilator  -> ventilator
   * ventilatory -> ventilator
   *
   * teplovzdusny -> teplovzdusn
   * teplovzdusne -> teplovzdusn
   *
   * Díky tomu poznáme, že:
   *
   * "ventilatory"
   *
   * přesně odpovídá kategorii:
   *
   * "Ventilátory"
   *
   * a nebudeme automaticky vybírat:
   *
   * "Teplovzdušné ventilátory".
   */
  function normalizeCategoryWord(
    word: string
  ): string {
    let value =
      normalizeText(word);

    if (value.length <= 5) {
      return value;
    }

    if (value.endsWith("y")) {
      value = value.slice(0, -1);
    }

    if (value.endsWith("e")) {
      value = value.slice(0, -1);
    }

    return value;
  }

  function categoryWordMatches(
    categoryWord: string,
    queryWord: string
  ): boolean {
    const categoryNormalized =
      normalizeCategoryWord(
        categoryWord
      );

    const queryNormalized =
      normalizeCategoryWord(
        queryWord
      );

    return (
      categoryNormalized ===
      queryNormalized
    );
  }

  function categoryMatchCount(
    category: string
  ): number {
    const categoryWords =
      normalizeText(category)
        .split(" ")
        .filter(Boolean);

    let matches = 0;

    for (const queryWord of queryWords) {
      if (
        categoryWords.some(
          (categoryWord) =>
            categoryWordMatches(
              categoryWord,
              queryWord
            )
        )
      ) {
        matches++;
      }
    }

    return matches;
  }

  function categoryIsExactPhrase(
    category: string
  ): boolean {
    const categoryWords =
      normalizeText(category)
        .split(" ")
        .filter(Boolean);

    if (
      categoryWords.length !==
      queryWords.length
    ) {
      return false;
    }

    return queryWords.every(
      (queryWord, index) =>
        categoryWordMatches(
          categoryWords[index],
          queryWord
        )
    );
  }

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

  /*
   * Z produktů vytvoříme důkaz,
   * jaké kategorie skutečně obsahují
   * relevantní výsledky.
   */
  const categoryScores =
    new Map<
      string,
      {
        matches: number;
        score: number;
      }
    >();

  const relevantHits =
    (
      data.results?.hits ?? []
    ).slice(0, 24);

  for (const hit of relevantHits) {
    const product =
      convertHit(hit);

    if (!product) {
      continue;
    }

    const relevance =
      Math.max(
        1,
        scoreProduct(
          product.name,
          keyword
        )
      );

    for (const category of getCategoryValues(
      hit
    )) {
      const matches =
        categoryMatchCount(
          category
        );

      if (matches === 0) {
        continue;
      }

      const existing =
        categoryScores.get(
          category
        ) ?? {
          matches: 0,
          score: 0,
        };

      existing.matches =
        Math.max(
          existing.matches,
          matches
        );

      existing.score +=
        relevance * matches;

      categoryScores.set(
        category,
        existing
      );
    }
  }

  /*
   * Nejdůležitější část:
   *
   * Pokud je dotaz:
   *
   * ventilatory
   *
   * a máme:
   *
   * Ventilátory
   * Teplovzdušné ventilátory
   *
   * obě kategorie mají slovo ventilátory,
   * ale "Ventilátory" je přesná shoda
   * celého dotazu.
   *
   * Proto ji vybereme.
   */
  const exactCategories =
    Array.from(
      categoryScores.keys()
    ).filter(
      category =>
        categoryIsExactPhrase(
          category
        )
    );

  if (
    exactCategories.length > 0
  ) {
    exactCategories.sort(
      (a, b) =>
        normalizeText(a).length -
        normalizeText(b).length
    );

    return exactCategories[0];
  }

  /*
   * Pokud je dotaz například:
   *
   * teplovzdusny ventilator
   *
   * najdeme:
   *
   * Teplovzdušné ventilátory
   *
   * protože obsahuje oba významové
   * výrazy dotazu.
   */
  const scoredCategories =
    Array.from(
      categoryScores.entries()
    ).sort((a, b) => {
      const matchDifference =
        b[1].matches -
        a[1].matches;

      if (matchDifference !== 0) {
        return matchDifference;
      }

      const scoreDifference =
        b[1].score -
        a[1].score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      /*
       * Při stejné shodě preferujeme
       * kratší název kategorie.
       *
       * Ventilátory
       * před
       * Teplovzdušné ventilátory
       */
      return (
        normalizeText(a[0]).length -
        normalizeText(b[0]).length
      );
    });

  if (
    scoredCategories.length > 0
  ) {
    return scoredCategories[0][0];
  }

  /*
   * Fallback na LuigiBox quicksearch.
   */
  const matchingQuickCategories =
    quickCategories
      .filter(
        (category) =>
          categoryMatchCount(
            category
          ) > 0
      )
      .sort((a, b) => {
        const aExact =
          categoryIsExactPhrase(
            a
          );

        const bExact =
          categoryIsExactPhrase(
            b
          );

        if (aExact && !bExact) {
          return -1;
        }

        if (!aExact && bExact) {
          return 1;
        }

        const matchDifference =
          categoryMatchCount(b) -
          categoryMatchCount(a);

        if (matchDifference !== 0) {
          return matchDifference;
        }

        return (
          normalizeText(a).length -
          normalizeText(b).length
        );
      });

  if (
    matchingQuickCategories.length > 0
  ) {
    return matchingQuickCategories[0];
  }

  /*
   * Pro dotazy typu:
   *
   * iPhone
   * iPhone 7
   * Galaxy S21
   *
   * nemusí být název kategorie
   * přímo v dotazu.
   *
   * V takovém případě použijeme
   * nejčastější kategorii relevantních
   * produktů.
   */
  const productCategoryScores =
    new Map<string, number>();

  for (const hit of relevantHits) {
    const product =
      convertHit(hit);

    if (!product?.category) {
      continue;
    }

    const relevance =
      Math.max(
        1,
        scoreProduct(
          product.name,
          keyword
        )
      );

    productCategoryScores.set(
      product.category,
      (
        productCategoryScores.get(
          product.category
        ) ?? 0
      ) + relevance
    );
  }

  const productCategories =
    Array.from(
      productCategoryScores.entries()
    ).sort(
      (a, b) => b[1] - a[1]
    );

  if (
    productCategories.length > 0
  ) {
    const top =
      productCategories[0];

    const second =
      productCategories[1];

    if (
      !second ||
      top[1] >= second[1] * 1.8
    ) {
      return top[0];
    }
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

  /*
   * Slova, která jsou běžným označením typu produktu.
   * Pokud je LuigiBox vrátí zároveň jako "brand",
   * nesmíme je považovat za výrobce.
   *
   * Například:
   * mixer -> LuigiBox může vrátit brand "Mixer"
   * notebook -> není výrobce
   */
  const genericProductTerms = new Set([
    "mixer",
    "mixery",
    "mixér",
    "mixéry",
    "notebook",
    "notebooky",
    "telefon",
    "telefony",
    "mobil",
    "mobily",
    "smartphone",
    "smartphony",
    "tablet",
    "tablety",
    "pocitac",
    "pocitace",
    "televize",
    "televizor",
    "monitor",
    "monitory",
    "hodinky",
    "sluchatka",
    "vysavac",
    "vysavace",
    "robot",
    "gril",
    "kavovar",
    "fotoaparat",
    "kamera",
    "drone",
    "dron",
    "konzole",
    "ventilator",
    "ventilatory",
    "lednice",
    "lednicky",
    "pracka",
    "pracky",
    "mycka",
    "mycky",
  ]);

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

  /*
   * Nejdříve zkusíme značku z quicksearch.
   * Ale pouze pokud nejde zároveň o obecné
   * označení produktu.
   *
   * Důležité:
   * mixer -> "Mixer" NESMÍ být značka
   * Dreo -> "Dreo" JE značka
   * Samsung -> "Samsung" JE značka
   */
  for (const brand of quickBrands) {
    const normalizedBrand =
      normalizeText(brand);

    if (
      !normalizedBrand ||
      genericProductTerms.has(
        normalizedBrand
      )
    ) {
      continue;
    }

    if (
      normalizedKeyword.includes(
        normalizedBrand
      )
    ) {
      console.error(
        `LUIGISBOX BRAND: značka z quicksearch = ${brand}`
      );

      return brand;
    }
  }

  /*
   * Pojistka pro případy, kdy LuigiBox quicksearch
   * značku nevrátí, ale značka je přímo uvedená
   * v názvech relevantních produktů.
   *
   * Například:
   * Lenovo notebook
   */
  const brandCandidates =
    new Map<string, number>();

  for (const product of products.slice(0, 24)) {
    if (!product.brand) {
      continue;
    }

    const brand =
      product.brand.trim();

    if (!brand) {
      continue;
    }

    const normalizedBrand =
      normalizeText(brand);

    if (
      !normalizedBrand ||
      genericProductTerms.has(
        normalizedBrand
      ) ||
      !normalizedKeyword.includes(
        normalizedBrand
      )
    ) {
      continue;
    }

    const score =
      Math.max(
        1,
        scoreProduct(
          product.name,
          keyword
        )
      );

    brandCandidates.set(
      brand,
      (brandCandidates.get(brand) ?? 0) +
        score
    );
  }

  if (brandCandidates.size > 0) {
    const sortedCandidates =
      Array.from(
        brandCandidates.entries()
      ).sort(
        (a, b) => b[1] - a[1]
      );

    console.error(
      `LUIGISBOX BRAND: značka z produktů = ${sortedCandidates[0][0]}`
    );

    return sortedCandidates[0][0];
  }

  /*
   * Poslední možnost:
   * dominantní výrobce mezi relevantními produkty.
   * Ani zde nepovolíme obecný název produktu
   * jako "Mixer".
   */
  const brandScores =
    new Map<string, number>();

  for (const product of products.slice(0, 24)) {
    if (!product.brand) {
      continue;
    }

    const brand =
      product.brand.trim();

    if (!brand) {
      continue;
    }

    const normalizedBrand =
      normalizeText(brand);

    if (
      genericProductTerms.has(
        normalizedBrand
      )
    ) {
      continue;
    }

    const score =
      Math.max(
        1,
        scoreProduct(
          product.name,
          keyword
        )
      );

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
    console.error(
      `LUIGISBOX BRAND: dominantní značka = ${top[0]}`
    );

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
   * Produkty + kategorie + výrobci.
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
   * Nejdříve výrobce.
   */
  const brand =
    findBrand(
      keyword,
      discoveryProducts,
      discoveryData
    );

  /*
   * Potom kategorie.
   *
   * Pokud je dotaz pouze značka,
   * findCategory vrátí null.
   */
  const category =
    findCategory(
      keyword,
      brand,
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
   * Žádný filtr:
   * použijeme původní výsledky.
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
   * Přesný dotaz s nalezenými filtry.
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
   * Pojistka proti příliš úzkému filtru.
   */
  if (
    filteredProducts.length === 0 &&
    discoveryProducts.length > 0
  ) {
    console.error(
      "LUIGISBOX: přesný filtr vrátil 0 produktů, používám discovery výsledky."
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
