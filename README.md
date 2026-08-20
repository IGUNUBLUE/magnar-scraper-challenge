# Magnar scraping challenge

An HTTP-only TypeScript scraper for the Peru Judiciary jurisprudence system. It starts a JSF general search, extracts RichFaces result cards, follows the server's AJAX paginator, stores structured records, and downloads linked PDFs without browser automation.

## Requirements

- Node.js 20 or newer
- Access to the target through the required Peru VPN

## Install

```bash
npm install
```

## Run

Start the default general search, visit ten pages, and write `data/documents.json`:

```bash
npm start
```

Keep the first live run small:

```bash
npm start -- --max-pages 2
```

Search the resolution text:

```bash
npm start -- --query 'responsabilidad civil' --max-pages 5
```

Download PDFs after checking the extracted records:

```bash
npm start -- --max-pages 5 --download-pdfs
```

The scraper keeps every visible result-card field under `fields`, including the resource type, expediente, date, court, summary, keywords, and legal-rule text when the source provides them. PDF links use the `ServletDescarga` URL present in each card.

## Rate limits and failures

`PdfDownloader` treats HTTP 429 as retryable. It honours `Retry-After` when the server sends a seconds value; otherwise it waits 1, 2, 4, then 8 seconds, capped at one minute. After four unsuccessful attempts, the document goes to `data/failed-downloads.ndjson`, one JSON object per line.

Network failures and other HTTP failures also retry, then enter the same log instead of stopping the collection.

## Verify locally

```bash
npm run build
npm test
npm start -- --html-file test/fixtures/results.html
```

The fixture contains the RichFaces card and PDF structure observed on the live target. It checks JSON persistence without contacting the source.

## Project layout

- `src/parser.ts`: JSF general-search request, RichFaces card extraction, and AJAX pagination payloads.
- `src/downloader.ts`: PDF filenames, rate-limit retries, failure log.
- `src/http.ts`: Axios transport with a JSF session cookie jar. No browser runtime.
- `test/scraper.test.ts`: card parsing, AJAX pagination, partial response parsing, and HTTP 429 coverage.

Generated records and PDFs stay out of Git through `.gitignore`.
