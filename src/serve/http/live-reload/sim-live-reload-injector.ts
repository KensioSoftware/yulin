import { SimLiveReloadInjectable } from "./sim-live-reload-injectable.js";
import { simLiveReloadScriptTag } from "./sim-live-reload-script.js";
import { simLiveReloadHeaderName } from "./sim-live-reload.config.js";

/**
 * Puts the live reload script into HTML on its way to a browser.
 *
 * The script goes in at the end of the document, so the page has parsed before
 * a connection is opened. The bytes of the body change, so anything describing
 * those bytes has to change with them: `content-length` is recomputed, and
 * `etag` and `last-modified` are dropped rather than left describing the
 * stored Object the page no longer is.
 */
export class SimLiveReloadInjector {
  private readonly injectable = new SimLiveReloadInjectable();

  /**
   * Return the response a browser should get, injected if it can take it.
   */
  async injectInto(request: Request, response: Response): Promise<Response> {
    if (!this.injectable.allows(request, response)) {
      return response;
    }

    return this.inject(response);
  }

  private async inject(response: Response): Promise<Response> {
    const body = insertScriptTag(await response.text());
    const headers = new Headers(response.headers);

    headers.delete("etag");
    headers.delete("last-modified");
    headers.set("content-length", String(Buffer.byteLength(body)));
    headers.set(simLiveReloadHeaderName, "injected");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

// Matched against the document as written, rather than against a lowercased
// copy, because lowercasing can change a string's length and move every offset
// after the character that changed.
const closingTagPatterns = [/<\/body\s*>/gi, /<\/html\s*>/gi];

/**
 * Put the script at the end of the document, wherever that turns out to be.
 *
 * A closing tag is the ordinary case. HTML without one is still something a
 * browser will render, so appending is better than declining to reload it.
 */
function insertScriptTag(html: string): string {
  for (const pattern of closingTagPatterns) {
    const at = lastMatchIndex(html, pattern);

    if (at !== -1) {
      return html.slice(0, at) + simLiveReloadScriptTag + html.slice(at);
    }
  }

  return html + simLiveReloadScriptTag;
}

/**
 * Where the document's own closing tag is, rather than one inside it.
 */
function lastMatchIndex(html: string, pattern: RegExp): number {
  let index = -1;

  for (const match of html.matchAll(pattern)) {
    index = match.index;
  }

  return index;
}
