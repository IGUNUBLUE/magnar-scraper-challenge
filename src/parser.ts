import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { DocumentRecord } from "./types.js";

export type PageRequest = { url: string; body: URLSearchParams };

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const absoluteUrl = (value: string, currentUrl: string) => new URL(value, currentUrl).toString();

function formValues($: cheerio.CheerioAPI, form: Element): URLSearchParams {
  const body = new URLSearchParams();
  $(form).find("input[name], select[name], textarea[name]").each((_, field) => {
    const element = $(field);
    const name = element.attr("name");
    const type = element.attr("type");
    if (!name || type === "image" || type === "submit" || type === "button") return;
    if ((type === "checkbox" || type === "radio") && !element.is(":checked")) return;
    const value = field.tagName === "select" ? element.find("option:selected").attr("value") : element.attr("value");
    body.set(name, value ?? "");
  });
  return body;
}

function jsfParameters(onclick: string): URLSearchParams {
  const parameters = new URLSearchParams();
  const decoded = onclick.replaceAll("\\'", "'").replaceAll('\\"', '"');
  const object = decoded.match(/\{([\s\S]*?)\}/)?.[1];
  if (!object) return parameters;
  for (const pair of object.matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g)) parameters.set(pair[1], pair[2]);
  return parameters;
}

export function initialSearchRequest(html: string, currentUrl: string, query?: string): PageRequest {
  const $ = cheerio.load(html);
  const form = $("form#formBuscador").first();
  const trigger = form.find('input[type="image"][onclick*="forward"]').filter((_, element) => !($(element).attr("onclick") ?? "").includes("busqueda")).first();
  const formElement = form.get(0);
  if (!formElement || !trigger.length) throw new Error("Could not find the initial general-search control");
  const body = formValues($, formElement);
  for (const [name, value] of jsfParameters(trigger.attr("onclick") ?? "")) body.set(name, value);
  if (query) body.set("formBuscador:txtBusqueda", query);
  return { url: absoluteUrl(form.attr("action") || currentUrl, currentUrl), body };
}

export function extractDocuments(html: string, sourceUrl: string, page: number): DocumentRecord[] {
  const $ = cheerio.load(html);
  const cards = $("div.rf-p").filter((_, card) => /:repeat:\d+:/.test($(card).attr("id") ?? ""));
  return cards.toArray().flatMap((card) => {
    const header = $(card).find(".rf-p-hdr").first();
    const headerValues = header.find("span").map((_, span) => clean($(span).text())).get().filter(Boolean);
    const id = headerValues.at(-1);
    if (!id) return [];
    const fields: Record<string, string> = { Recurso: headerValues.at(-2) ?? "", Expediente: id };
    $(card).find(".txtbold").each((_, label) => {
      const name = clean($(label).text()).replace(/:$/, "");
      const value = clean($(label).next().text());
      if (name) fields[name] = value;
    });
    const pdfHref = $(card).find('a[href*="ServletDescarga"]').attr("href");
    return [{ id: id.replace(/[^\w.-]+/g, "-"), page, fields, sourceUrl, pdfUrl: pdfHref ? absoluteUrl(pdfHref, sourceUrl) : undefined }];
  });
}

export function paginationRequest(html: string, currentUrl: string, page: number): PageRequest {
  const $ = cheerio.load(html);
  const form = $("form#formBuscador").first();
  const formElement = form.get(0);
  if (!formElement) throw new Error("Could not find the result form");
  const body = formValues($, formElement);
  body.set("formBuscador:spinner", String(page));
  body.set("formBuscador:spinner2", String(page));
  body.set("javax.faces.source", "formBuscador:data1");
  body.set("javax.faces.partial.event", "rich:datascroller:onscroll");
  body.set("javax.faces.partial.execute", "formBuscador:data1 @component");
  body.set("javax.faces.partial.render", "@component");
  body.set("formBuscador:data1:page", String(page));
  body.set("org.richfaces.ajax.component", "formBuscador:data1");
  body.set("formBuscador:data1", "formBuscador:data1");
  body.set("AJAX:EVENTS_COUNT", "1");
  body.set("javax.faces.partial.ajax", "true");
  return { url: absoluteUrl(form.attr("action") || currentUrl, currentUrl), body };
}

export function panelFromPartialResponse(xml: string): string {
  const match = xml.match(/<update id="formBuscador:panel"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/);
  if (!match) throw new Error("Partial response did not include the document panel");
  return match[1];
}

export function resultPageCount(html: string): number {
  const match = html.match(/maxValue:\s*(\d+)/);
  if (!match) throw new Error("Could not determine the total number of result pages");
  return Number(match[1]);
}
