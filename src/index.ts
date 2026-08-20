import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PdfDownloader } from "./downloader.js";
import { AxiosTransport } from "./http.js";
import { extractDocuments, initialSearchRequest, paginationRequest, panelFromPartialResponse, resultPageCount } from "./parser.js";

const DEFAULT_URL = "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml";

type Options = { url: string; maxPages?: number; downloadPdfs: boolean; htmlFile?: string; query?: string };

function readOptions(arguments_: string[]): Options {
  const valueAfter = (flag: string) => {
    const position = arguments_.indexOf(flag);
    return position === -1 ? undefined : arguments_[position + 1];
  };
  const maxPagesValue = valueAfter("--max-pages");
  const maxPages = maxPagesValue === undefined ? undefined : Number(maxPagesValue);
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1)) throw new Error("--max-pages must be a positive integer");
  return { url: valueAfter("--url") ?? DEFAULT_URL, maxPages, downloadPdfs: arguments_.includes("--download-pdfs"), htmlFile: valueAfter("--html-file"), query: valueAfter("--query") };
}

async function scrape(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const http = new AxiosTransport();
  let resultHtml: string;
  let resultUrl = options.url;

  if (options.htmlFile) {
    resultHtml = await readFile(resolve(options.htmlFile), "utf8");
  } else {
    const landing = await http.get(options.url);
    if (landing.status !== 200 || typeof landing.data !== "string") throw new Error(`Landing page returned HTTP ${landing.status}`);
    const request = initialSearchRequest(landing.data, options.url, options.query);
    const response = await http.post(request.url, request.body);
    const redirectLocation = response.headers["location"];
    if (response.status >= 300 && response.status < 400 && redirectLocation) {
      const redirectUrl = new URL(redirectLocation, request.url);
      redirectUrl.protocol = "https:";
      const result = await http.get(redirectUrl.toString());
      if (result.status !== 200 || typeof result.data !== "string") throw new Error(`Result page returned HTTP ${result.status}`);
      resultHtml = result.data;
      resultUrl = redirectUrl.toString();
    } else {
      if (response.status !== 200) throw new Error(`Initial search returned HTTP ${response.status}`);
      resultHtml = response.data;
      resultUrl = request.url.replace("inicio.xhtml", "resultado.xhtml");
    }
  }

  const totalPages = options.htmlFile ? 1 : resultPageCount(resultHtml);
  const pagesToVisit = Math.min(options.maxPages ?? totalPages, totalPages);
  const documents = [];
  for (let page = 1; page <= pagesToVisit; page += 1) {
    let pageHtml = resultHtml;
    if (page > 1) {
      const request = paginationRequest(resultHtml, resultUrl, page);
      const response = await http.post(request.url, request.body, true);
      if (response.status !== 200) throw new Error(`Page ${page} returned HTTP ${response.status}`);
      pageHtml = panelFromPartialResponse(response.data);
    }
    const pageRecords = extractDocuments(pageHtml, resultUrl, page);
    documents.push(...pageRecords);
    console.info(`Page ${page}: ${pageRecords.length} documents`);
    if (options.htmlFile) break;
  }

  const uniqueDocuments = [...new Map(documents.map((document) => [`${document.id}:${document.pdfUrl ?? ""}`, document])).values()];
  await mkdir("data", { recursive: true });
  await writeFile("data/documents.json", `${JSON.stringify(uniqueDocuments, null, 2)}\n`);
  console.info(`Saved ${uniqueDocuments.length} documents to data/documents.json`);
  if (!options.downloadPdfs) return;
  const downloader = new PdfDownloader(http, "downloads", "data/failed-downloads.ndjson");
  for (const document of uniqueDocuments) console.info(`${document.id}: ${await downloader.download(document)}`);
}

scrape().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
