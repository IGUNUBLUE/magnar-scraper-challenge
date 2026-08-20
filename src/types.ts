export type DocumentRecord = {
  id: string;
  page: number;
  fields: Record<string, string>;
  sourceUrl: string;
  pdfUrl?: string;
};

export type FailedDownload = {
  documentId: string;
  pdfUrl: string;
  attempts: number;
  reason: string;
  failedAt: string;
};

export type HttpResult<T> = {
  status: number;
  headers: Record<string, string | undefined>;
  data: T;
};

export interface HttpTransport {
  get(url: string, binary?: boolean): Promise<HttpResult<string | Uint8Array>>;
  post(url: string, body: URLSearchParams, partial?: boolean): Promise<HttpResult<string>>;
}
