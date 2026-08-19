import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectMatches,
  assertTrue,
} from "@kensio/smartass";
import { SimCffEventAdapter } from "./sim-cff-event-adapter.js";
import { cloudFrontResponseFactory } from "../../factory/cloudfront-functions.factory.js";

describe("repeated headers through a sim CloudFront Function", () => {
  const adapter = new SimCffEventAdapter();

  const signInCookie = "session=abc123; Path=/; HttpOnly";
  const signedInCookie = "signed-in=1; Path=/";

  it("gives a Function every value of a repeated Set-Cookie", () => {
    // Given an origin response setting two cookies.
    const request = new Request("https://example.test/callback");
    const response = new Response(null, { status: 303 });
    response.headers.append("set-cookie", signInCookie);
    response.headers.append("set-cookie", signedInCookie);

    const event = adapter.toViewerResponseEvent(request, response);

    assertObjectMatches(event.response.headers, {
      "set-cookie": {
        value: signInCookie,
        multiValue: [{ value: signInCookie }, { value: signedInCookie }],
      },
    });
  });

  it("presents a single Set-Cookie as a plain value", () => {
    const request = new Request("https://example.test/callback");
    const response = new Response(null, { status: 303 });
    response.headers.append("set-cookie", signInCookie);

    const event = adapter.toViewerResponseEvent(request, response);

    assertObjectMatches(event.response.headers, {
      "set-cookie": { value: signInCookie },
    });
    assertTrue(!("multiValue" in event.response.headers["set-cookie"]));
  });

  it("keeps both cookies when a Function returns the response unchanged", () => {
    // Given a Function that only adds a header of its own.
    const request = new Request("https://example.test/callback");
    const response = new Response(null, { status: 303 });
    response.headers.append("set-cookie", signInCookie);
    response.headers.append("set-cookie", signedInCookie);

    const event = adapter.toViewerResponseEvent(request, response);
    event.response.headers["x-checked-by"] = { value: "sign-in" };

    const viewerResponse = adapter.fromViewerResponseResult(
      event.response,
      response,
    );

    assertArrayEquals(viewerResponse.headers.getSetCookie(), [
      signInCookie,
      signedInCookie,
    ]);
    assertIdentical(viewerResponse.headers.get("x-checked-by"), "sign-in");
  });

  it("sends the cookies a Function writes into multiValue", () => {
    // Given a Function replacing the origin's cookies with its own.
    const originalResponse = new Response(null, { status: 200 });
    const cffResponse = cloudFrontResponseFactory.make({
      statusCode: 200,
      headers: {
        "set-cookie": {
          value: signInCookie,
          multiValue: [{ value: signInCookie }, { value: signedInCookie }],
        },
      },
    });

    const viewerResponse = adapter.fromViewerResponseResult(
      cffResponse,
      originalResponse,
    );

    assertArrayEquals(viewerResponse.headers.getSetCookie(), [
      signInCookie,
      signedInCookie,
    ]);
  });
});
