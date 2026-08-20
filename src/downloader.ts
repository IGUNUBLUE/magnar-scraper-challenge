import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DocumentRecord, FailedDownload, HttpTransport } from "./types.js";

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(attempt: number, retryAfter: string | undefined): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  return Math.min(60_000, 1_000 * 2 ** attempt);
}

function filenameFor(document: DocumentRecord): string {
  const label = Object.values(document.fields).find((value) => value.length > 0) || document.id;
  return `${document.id}-${label}`.replace(/[^\w.-]+/g, "-").slice(0, 150).replace(/-+$/, "") + ".pdf";
}

export class PdfDownloader {
  constructor(
    private readonly http: HttpTransport,
    private readonly downloadDirectory: string,
    private readonly failedLogPath: string,
    private readonly attempts = 4,
  ) {}

  async download(document: DocumentRecord): Promise<"downloaded" | "skipped" | "failed"> {
    if (!document.pdfUrl) return "skipped";
    await mkdir(this.downloadDirectory, { recursive: true });
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      try {
        const response = await this.http.get(document.pdfUrl, true);
        if (response.status >= 200 && response.status < 300 && response.data instanceof Uint8Array) {
          await writeFile(join(this.downloadDirectory, filenameFor(document)), response.data);
          return "downloaded";
        }
        if (response.status !== 429) throw new Error(`HTTP ${response.status}`);
        await sleep(retryDelay(attempt, response.headers["retry-after"]));
      } catch (error) {
        if (attempt === this.attempts - 1) break;
        await sleep(retryDelay(attempt, undefined));
        if (!(error instanceof Error)) throw error;
      }
    }
    const failure: FailedDownload = {
      documentId: document.id,
      pdfUrl: document.pdfUrl,
      attempts: this.attempts,
      reason: "PDF request did not succeed after retries",
      failedAt: new Date().toISOString(),
    };
    await mkdir(dirname(this.failedLogPath), { recursive: true });
    await appendFile(this.failedLogPath, `${JSON.stringify(failure)}\n`);
    return "failed";
  }
}
