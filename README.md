# OdKarla hlídač

Osobní nástroj, který hlídá OdKarla.cz podle tebou zadaných hledaných výrazů /
kategorií a pošle ti zprávu na Telegram, když se objeví nová odpovídající
položka nebo když existující položka zlevní (pod tvou cílovou cenu).

Web (Next.js) běží na Vercelu, data jsou v Postgres databázi, hlídání spouští
GitHub Actions v pravidelném intervalu.

## 0. Než začneš – slušné používání

Tohle stahuje veřejné stránky OdKarla.cz o něco častěji, než by je navštívil
běžný člověk. Aby to nikomu nedělalo problémy:
- Nech interval alespoň 30 minut (výchozí nastavení), neškáluj to na stovky
  požadavků za hodinu.
- Je to pro tvou osobní potřebu, ne pro přeprodej dat/scraping na komerční
  účely.
- Pokud bys narazil na blokaci (403, captcha), interval si prodluž a
  nepokoušej se to obcházet.

## 1. Založ si repozitář na GitHubu

Nahraj obsah této složky do nového privátního repozitáře na svém GitHubu
(přes web upload, nebo `git init && git add . && git commit -m init && git push`).

## 2. Nasaď na Vercel

1. Na [vercel.com](https://vercel.com) → **Add New Project** → vyber svůj repozitář.
2. Framework Preset se automaticky pozná jako Next.js, nic neměň.
3. Zatím **Deploy** – i bez databáze se to nasadí (jen dashboard bude hlásit chybu, než přidáš DB, viz krok 3).

## 3. Přidej databázi (Vercel Postgres)

1. V projektu na Vercelu → záložka **Storage** → **Create Database** → **Postgres** (nebo Neon, je to totéž pod kapotou).
2. Po vytvoření ji **propoj (Connect)** s tímto projektem – Vercel sám přidá
   proměnnou `POSTGRES_URL` do nastavení projektu.
3. Redeploy projektu (Vercel se zeptá sám, nebo Deployments → tři tečky → Redeploy).

## 4. Založ Telegram bota

1. V Telegramu najdi **@BotFather**, napiš `/newbot`, zvol jméno.
   Dostaneš **token** (dlouhý řetězec, vypadá jako `123456:ABC-...`).
2. Napiš svému novému botovi jakoukoliv zprávu (ať "ví", že s tebou má komunikovat).
3. Zjisti své **chat_id**: v prohlížeči otevři
   `https://api.telegram.org/bot<TVŮJ_TOKEN>/getUpdates`
   po té zprávě z kroku 2 tam uvidíš `"chat":{"id": 123456789, ...}` – to číslo je tvé chat_id.
   (Nebo použij bota @userinfobot, který ti ID rovnou napíše.)

## 5. Nastav proměnné prostředí na Vercelu

Projekt → **Settings → Environment Variables**, přidej:

| Proměnná | Hodnota |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token z BotFather |
| `TELEGRAM_CHAT_ID` | tvé chat_id |
| `CRON_SECRET` | libovolný náhodný dlouhý řetězec (vymysli si, nikam ho neposílej) |
| `SEARCH_URL_TEMPLATE` | viz níže |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | volitelné, ochrání dashboard heslem |

**Ověření `SEARCH_URL_TEMPLATE`:** na OdKarla.cz zadej do políčka "Hledej"
nějaký výraz a odešli. Zkopíruj přesnou adresu z adresního řádku a nahraď
hledaný výraz textem `{query}`. Výchozí odhad v `.env.example` je
`https://www.odkarla.cz/vyhledavani?string={query}` – ověř si to, může se
lišit.

Po přidání proměnných udělej znovu **Redeploy**.

## 6. Nastav GitHub Actions (pravidelné spouštění)

V repozitáři na GitHubu → **Settings → Secrets and variables → Actions** → **New repository secret**:

- `VERCEL_URL` = adresa tvého nasazení, např. `https://odkarla-monitor.vercel.app` (bez lomítka na konci)
- `CRON_SECRET` = stejná hodnota, jakou jsi dal do Vercel proměnných

Workflow v `.github/workflows/scan.yml` pak sám každých 30 minut zavolá
`/api/scan`. Můžeš ho i ručně spustit: záložka **Actions** → **Scan OdKarla.cz** → **Run workflow**.

## 7. Vyzkoušej

1. Otevři svou vercel.app adresu, přidej hlídání (např. výraz "zvlhčovač", volitelně cílovou cenu).
2. Ručně spusť workflow v GitHub Actions (krok výše), nebo počkej na plánovaný běh.
3. Zkontroluj v Actions logu, kolik položek se našlo. Pokud přijde nová/zlevněná položka, přijde ti zpráva na Telegram.

## Když se něco rozbije

- **Scan nic nenajde ani u výrazu, který na webu ručně vidíš**: nejspíš je
  špatně `SEARCH_URL_TEMPLATE`, nebo se HTML struktura stránky změnila natolik,
  že selektor v `lib/scraper.ts` produkty nenajde. Zkus se podívat do
  zdrojového kódu stránky (View Page Source) a poupravit logiku v
  `scrapeSearchPage`.
- **Telegram zprávy nechodí**: zkontroluj token/chat_id, a že jsi botovi
  poslal aspoň jednu zprávu (jinak ti nemůže psát jako první).
- **/api/scan vrací 401**: nesedí `CRON_SECRET` mezi GitHub Secrets a Vercel
  proměnnými.

## Struktura projektu

```
app/page.tsx              – dashboard (přidávání/mazání hlídání, přehled nálezů)
app/api/watches           – CRUD nad hlídanými výrazy
app/api/scan               – hlavní logika: projde hlídání, scrapuje, notifikuje
lib/scraper.ts             – stahování a parsování výsledků hledání
lib/telegram.ts            – odeslání zprávy přes Telegram Bot API
lib/db.ts                  – Postgres schéma (watches, found_items)
.github/workflows/scan.yml – pravidelné spouštění scanu
```
