import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PdfDownloader } from "../src/downloader.js";
import { extractDocuments, paginationRequest, panelFromPartialResponse } from "../src/parser.js";
import type { HttpResult, HttpTransport } from "../src/types.js";

const RESULT_HTML = `<form id="formBuscador" action="resultado.xhtml"><input type="hidden" name="javax.faces.ViewState" value="state-1"/><input name="formBuscador:spinner" value="1"/><div class="rf-p" id="formBuscador:repeat:0:j_idt455"><div class="rf-p-hdr"><span>Casación</span><span>029269-2025</span></div><div class="rf-p-b"><div class="txtbold">Fecha Resolución:</div><div>14/08/2026</div><div class="txtbold">Sumilla:</div><div>Texto de prueba</div><a href="/jurisprudenciaweb/ServletDescarga?uuid=abc">PDF</a></div></div></form>`;

test("extracts RichFaces result cards, PDF links, and page requests", () => {
  const documents = extractDocuments(RESULT_HTML, "https://example.test/resultado.xhtml", 1);
  assert.deepEqual(documents, [{ id: "029269-2025", page: 1, fields: { Recurso: "Casación", Expediente: "029269-2025", "Fecha Resolución": "14/08/2026", Sumilla: "Texto de prueba" }, sourceUrl: "https://example.test/resultado.xhtml", pdfUrl: "https://example.test/jurisprudenciaweb/ServletDescarga?uuid=abc" }]);
  const request = paginationRequest(RESULT_HTML, "https://example.test/resultado.xhtml", 2);
  assert.equal(request.body.get("formBuscador:data1:page"), "2");
  assert.equal(request.body.get("javax.faces.partial.ajax"), "true");
  assert.equal(panelFromPartialResponse('<partial-response><update id="formBuscador:panel"><![CDATA[<div>page 2</div>]]></update></partial-response>'), "<div>page 2</div>");
});

test("retries a rate-limited PDF and saves the eventual response", async () => {
  let calls = 0;
  const transport: HttpTransport = {
    async get(): Promise<HttpResult<string | Uint8Array>> { calls += 1; return calls === 1 ? { status: 429, headers: { "retry-after": "0" }, data: new Uint8Array() } : { status: 200, headers: {}, data: new Uint8Array([37, 80, 68, 70]) }; },
    async post(): Promise<HttpResult<string>> { throw new Error("not used"); },
  };
  const directory = await mkdtemp(join(tmpdir(), "magnar-scraper-"));
  const downloader = new PdfDownloader(transport, directory, join(directory, "failed.ndjson"), 2);
  const result = await downloader.download({ id: "123-2024", page: 1, fields: { Expediente: "123-2024" }, sourceUrl: "https://example.test", pdfUrl: "https://example.test/123.pdf" });
  assert.equal(result, "downloaded");
  assert.equal(calls, 2);
  assert.deepEqual(await readFile(join(directory, "123-2024-123-2024.pdf")), Buffer.from([37, 80, 68, 70]));
});
