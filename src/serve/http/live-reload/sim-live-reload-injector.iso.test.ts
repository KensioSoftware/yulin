import {
  assertIdentical,
  assertStringEndsWith,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimLiveReloadInjector } from "./sim-live-reload-injector.js";
import { simLiveReloadHeaderName } from "./sim-live-reload.config.js";

describe("SimLiveReloadInjector", () => {
  it("puts the script at the end of the body", async () => {
    // Given an ordinary page
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<html><body><h1>Hi</h1></body></html>");

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then the script is the last thing in the body
    assertStringEndsWith(await injected.text(), "</script></body></html>");
    assertIdentical(injected.headers.get(simLiveReloadHeaderName), "injected");
  });

  it("puts the script before the closing html tag when there is no body", async () => {
    // Given a page with no body element
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<html><h1>Hi</h1></html>");

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then the script still goes at the end of the document
    assertStringEndsWith(await injected.text(), "</script></html>");
  });

  it("appends the script to a fragment with no closing tag", async () => {
    // Given HTML that is not a whole document
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<h1>Hi</h1>");

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then the script goes on the end, since a browser will render it anyway
    assertStringIncludes(await injected.text(), "<h1>Hi</h1><script");
  });

  it("finds a closing tag written in capitals", async () => {
    // Given a page whose tags are not lower case
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<HTML><BODY>Hi</BODY></HTML>");

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then the script still goes at the end of the body
    assertStringEndsWith(await injected.text(), "</script></BODY></HTML>");
  });

  it("puts the script after content that lowercases to a longer string", async () => {
    // Given a page holding a character that grows when it is lowercased
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<html><body>İstanbul</body></html>");

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then the script lands on the tag rather than a few characters off it
    assertStringIncludes(
      await injected.text(),
      "İstanbul<script data-sim-aws-live-reload>",
    );
  });

  it("describes the bytes it actually sends", async () => {
    // Given a page whose headers describe the stored Object
    const injector = new SimLiveReloadInjector();
    const page = "<html><body></body></html>";
    const response = htmlResponse(page, {
      "content-length": String(page.length),
      etag: '"9a0364b9e99bb480dd25e1f0284c8555"',
      "last-modified": "Wed, 05 Aug 2026 12:00:00 GMT",
    });

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);
    const body = await injected.text();

    // Then those headers describe the injected page, or are gone
    assertIdentical(
      injected.headers.get("content-length"),
      String(Buffer.byteLength(body)),
    );
    assertIdentical(injected.headers.get("etag"), null);
    assertIdentical(injected.headers.get("last-modified"), null);
  });

  it("keeps an injected page out of the browser cache", async () => {
    // Given a page the service said could be held on to
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<html><body></body></html>", {
      "cache-control": "public, max-age=3600",
    });

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then it is not stored, since a cached copy is one live reload cannot reach
    assertIdentical(injected.headers.get("cache-control"), "no-store");
  });

  it("returns a response it cannot inject untouched", async () => {
    // Given a response that is not an HTML page
    const injector = new SimLiveReloadInjector();
    const response = new Response('{"ok":true}', {
      headers: { "content-type": "application/json" },
    });

    // When it is served
    const served = await injector.injectInto(browserRequest(), response);

    // Then it is the same response, with nothing added
    assertIdentical(served, response);
    assertIdentical(served.headers.get(simLiveReloadHeaderName), null);
  });

  it("keeps the status of the response it injects", async () => {
    // Given an HTML error page
    const injector = new SimLiveReloadInjector();
    const response = htmlResponse("<html><body>Gone</body></html>", {}, 404);

    // When it is served to a browser
    const injected = await injector.injectInto(browserRequest(), response);

    // Then it is still the same error
    assertIdentical(injected.status, 404);
  });
});

function browserRequest(): Request {
  return new Request("http://site.sim-aws.localhost/", {
    headers: { accept: "text/html" },
  });
}

function htmlResponse(
  body: string,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}
