import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimLiveReloadInjectable } from "./sim-live-reload-injectable.js";

describe("SimLiveReloadInjectable", () => {
  it("allows an HTML page a browser asked for", () => {
    // Given an HTML response to a browser request
    const injectable = new SimLiveReloadInjectable();

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), htmlResponse());

    // Then the script can go in
    assertTrue(allowed);
  });

  it("refuses a response that is not HTML", () => {
    // Given a JSON response
    const injectable = new SimLiveReloadInjectable();
    const response = htmlResponse({ "content-type": "application/json" });

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), response);

    // Then it is left alone
    assertFalse(allowed);
  });

  it("refuses a response that does not say what it is", () => {
    // Given a response with no content type at all
    const injectable = new SimLiveReloadInjectable();
    const response = new Response("<html></html>");
    response.headers.delete("content-type");

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), response);

    // Then it is left alone, rather than guessed at
    assertFalse(allowed);
  });

  it("refuses a request that did not ask for HTML", () => {
    // Given a request from something that will not render a page
    const injectable = new SimLiveReloadInjectable();
    const request = browserRequest({ accept: "application/json" });

    // When its response is considered for the reload script
    const allowed = injectable.allows(request, htmlResponse());

    // Then it is left alone
    assertFalse(allowed);
  });

  it("refuses a signed request", () => {
    // Given a request an AWS client signed
    const injectable = new SimLiveReloadInjectable();
    const request = browserRequest({
      authorization: "AWS4-HMAC-SHA256 Credential=AKIA/20260806/eu-west-2/s3",
    });

    // When its response is considered for the reload script
    const allowed = injectable.allows(request, htmlResponse());

    // Then the Object comes back as it was stored
    assertFalse(allowed);
  });

  it("refuses a request carrying an AWS header", () => {
    // Given an unsigned request that is still an AWS client talking
    const injectable = new SimLiveReloadInjectable();
    const request = browserRequest({ "x-amz-content-sha256": "UNSIGNED" });

    // When its response is considered for the reload script
    const allowed = injectable.allows(request, htmlResponse());

    // Then the Object comes back as it was stored
    assertFalse(allowed);
  });

  it("refuses an encoded body", () => {
    // Given an HTML response the simulator would have to decode first
    const injectable = new SimLiveReloadInjectable();
    const response = htmlResponse({
      "content-type": "text/html",
      "content-encoding": "gzip",
    });

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), response);

    // Then it is left alone
    assertFalse(allowed);
  });

  it("refuses a partial response", () => {
    // Given a range of a page rather than the whole of it
    const injectable = new SimLiveReloadInjectable();
    const response = new Response("<html>", {
      status: 206,
      headers: { "content-type": "text/html" },
    });

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), response);

    // Then it is left alone
    assertFalse(allowed);
  });

  it("refuses a HEAD request", () => {
    // Given a request asking only for the headers of a page
    const injectable = new SimLiveReloadInjectable();
    const request = new Request("http://site.sim-aws.localhost/", {
      method: "HEAD",
      headers: { accept: "text/html" },
    });

    // When its response is considered for the reload script
    const allowed = injectable.allows(request, htmlResponse());

    // Then it is left alone, since it has no body to put the script in
    assertFalse(allowed);
  });

  it("refuses a response with no body", () => {
    // Given a response that carries no page
    const injectable = new SimLiveReloadInjectable();
    const response = new Response(null, {
      status: 204,
      headers: { "content-type": "text/html" },
    });

    // When it is considered for the reload script
    const allowed = injectable.allows(browserRequest(), response);

    // Then it is left alone
    assertFalse(allowed);
  });
});

function browserRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://site.sim-aws.localhost/", {
    headers: { accept: "text/html,application/xhtml+xml", ...headers },
  });
}

function htmlResponse(headers: Record<string, string> = {}): Response {
  return new Response("<html><body></body></html>", {
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}
