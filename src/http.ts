import axios, { type AxiosInstance } from "axios";
import type { HttpResult, HttpTransport } from "./types.js";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

export class AxiosTransport implements HttpTransport {
  private readonly client: AxiosInstance;
  private cookieHeader = "";

  constructor() {
    this.client = axios.create({
      timeout: 30_000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
    });
  }

  async get(url: string, binary = false): Promise<HttpResult<string | Uint8Array>> {
    const response = await this.client.get<ArrayBuffer | string>(url, {
      responseType: binary ? "arraybuffer" : "text",
      headers: this.cookieHeader ? { Cookie: this.cookieHeader } : undefined,
    });
    this.rememberCookies(response.headers["set-cookie"]);
    return {
      status: response.status,
      headers: response.headers as Record<string, string | undefined>,
      data: binary ? new Uint8Array(response.data as ArrayBuffer) : (response.data as string),
    };
  }

  async post(url: string, body: URLSearchParams, partial = false): Promise<HttpResult<string>> {
    const response = await this.client.post<string>(url, body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Origin: new URL(url).origin,
        Referer: url,
        "Accept-Language": "en-US,en;q=0.9",
        ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
        ...(partial ? { "Faces-Request": "partial/ajax", Accept: "*/*" } : {}),
      },
      responseType: "text",
    });
    this.rememberCookies(response.headers["set-cookie"]);
    return {
      status: response.status,
      headers: response.headers as Record<string, string | undefined>,
      data: response.data,
    };
  }

  private rememberCookies(setCookie: string[] | string | undefined): void {
    if (!setCookie) return;
    const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie]).map((value) => value.split(";", 1)[0]);
    const byName = new Map(this.cookieHeader.split("; ").filter(Boolean).map((value) => [value.split("=", 1)[0], value]));
    for (const cookie of cookies) byName.set(cookie.split("=", 1)[0], cookie);
    this.cookieHeader = [...byName.values()].join("; ");
  }
}
