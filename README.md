# Magnar scraping challenge

HTTP-only TypeScript scraper for the Peruvian Judiciary jurisprudence catalogue. It performs the site's JSF general-search flow, follows RichFaces AJAX pagination, writes each result card as JSON, and optionally downloads its resolution PDF. It does not use Puppeteer, Playwright, Selenium, or a WebDriver.

The target requires the Peru VPN specified in the challenge. This repository uses that access only for the assigned technical exercise.

## What the scraper does

1. Loads the landing page and preserves the JSF session cookie.
2. Submits the general-search form using its `ViewState` and JSF command parameters.
3. Repairs the site's HTTP redirect to HTTPS, then reads the result page.
4. Detects the RichFaces paginator's total page count and requests each page through the documented partial-AJAX form payload.
5. Extracts every visible result-card field and the linked `ServletDescarga` PDF URL.
6. Writes unique records to `data/documents.json`.
7. When PDF mode is enabled, downloads each PDF sequentially and records unrecoverable failures in `data/failed-downloads.ndjson`.

## Requirements

- Node.js 20 or newer
- npm
- Peru VPN access to `jurisprudencia.pj.gob.pe` for live runs

## Install

```bash
git clone git@github.com:IGUNUBLUE/magnar-scraper-challenge.git
cd magnar-scraper-challenge
npm install
```

## Fast verification without VPN

The fixture follows the RichFaces card structure captured from the live site. It exercises parsing and JSON persistence without sending a request to the source.

```bash
npm run build
npm test
rm -rf data
npm start -- --html-file test/fixtures/results.html
cat data/documents.json
```

Expected outcome: compilation succeeds, four tests pass, and `data/documents.json` contains one record with its `pdfUrl`.

## Live run

Connect the Peru VPN first. Begin with two pages, inspect the JSON, then remove the limit only when the extracted data looks correct.

```bash
rm -rf data downloads
npm start -- --max-pages 2
```

The live result should print one line per page, then create `data/documents.json`. A two-page check against the source returned 20 records and 20 PDF URLs during development.

Search the text of the resolutions with `--query`:

```bash
npm start -- --query 'responsabilidad civil' --max-pages 5
```

Run the full catalogue by omitting `--max-pages`:

```bash
npm start
```

The scraper reads the current `maxValue` from the RichFaces paginator. `--max-pages` exists only to cap development or recovery runs; it does not change the server-side query.

## PDF download mode

Enable PDF downloads after confirming the record data. Start with a small page limit because the source may answer rapid PDF requests with HTTP 429.

```bash
npm start -- --max-pages 1 --download-pdfs
```

Downloaded files go to `downloads/`. Filenames include the expediente and a sanitized descriptive field. The downloader accepts a successful response only when it has a PDF content type or starts with the `%PDF` signature.

## Output files

### `data/documents.json`

A JSON array. Each entry has this shape:

```json
{
  "id": "029269-2025",
  "page": 1,
  "fields": {
    "Recurso": "Casación",
    "Expediente": "029269-2025",
    "Fecha Resolución": "14/08/2026",
    "Sumilla": "..."
  },
  "sourceUrl": "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml",
  "pdfUrl": "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/ServletDescarga?uuid=..."
}
```

`fields` retains all labeled values rendered by each result card. Empty values stay as empty strings instead of disappearing from the record.

### `data/failed-downloads.ndjson`

Created only when a PDF cannot be fetched after the configured retry count. Each line is an independent JSON object, so failed URLs can be parsed and retried later without rereading the result pages.

## Rate limiting and recovery

A PDF HTTP 429 triggers a retry. The downloader uses the server's `Retry-After` value when present; otherwise it waits 1, 2, 4, then 8 seconds, with a one-minute ceiling. It writes a failure record after four unsuccessful attempts and continues with the next document.

Network errors and non-PDF or non-2xx responses follow the same failure path. They do not discard the extracted document JSON.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and emit `dist/`. |
| `npm test` | Run parser, paginator, successful-429-retry, and persistent-429-failure tests. |
| `npm start` | Crawl every page reported by the source. |
| `npm start -- --max-pages 2` | Crawl a bounded live subset. |
| `npm start -- --query 'text' --max-pages 5` | Crawl a bounded text search. |
| `npm start -- --max-pages 1 --download-pdfs` | Crawl one page and download its PDFs. |
| `npm start -- --html-file test/fixtures/results.html` | Run the fixture smoke check without VPN. |

## Source layout

- `src/http.ts`: Axios transport, session cookie handling, and explicit HTTPS redirect handling.
- `src/parser.ts`: JSF command generation, RichFaces card parsing, page-count detection, and partial-response extraction.
- `src/downloader.ts`: filename generation, PDF validation, retries, and failed-download log.
- `src/index.ts`: command-line options and crawl orchestration.
- `test/scraper.test.ts`: deterministic behavior checks.

`data/`, `downloads/`, `dist/`, and `node_modules/` are ignored by Git.
