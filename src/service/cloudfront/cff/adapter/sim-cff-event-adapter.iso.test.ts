import { describe, it } from "vitest";
import { SimCffEventAdapter } from "./sim-cff-event-adapter.js";
import {
  assertArrayIncludesAll,
  assertIdentical,
  assertInstanceOf,
  assertObjectHasProperty,
  assertObjectMatches,
  assertResponseStatus,
  assertTrue,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import {
  cloudFrontRequestFactory,
  cloudFrontResponseFactory,
} from "../../factory/cloudfront-functions.factory.js";

describe("sim CFF event structure adapter", () => {
  const adapter = new SimCffEventAdapter();

  describe("toViewerRequestEvent", () => {
    it("converts a Request to ViewerRequestEvent", () => {
      const request = new Request(
        "https://example.test/path/to/resource?foo=bar&baz=123",
      );
      const event = adapter.toViewerRequestEvent(request);

      assertIdentical(event.context.eventType, "viewer-request");
      assertObjectHasProperty(event.context, "requestId");
      assertIdentical(event.viewer.ip, "127.0.0.1");
      assertIdentical(event.request.method, "GET");
      assertIdentical(event.request.uri, "/path/to/resource");

      const queryString = event.request.querystring;
      assertArrayIncludesAll(Object.keys(queryString), ["foo", "baz"]);
    });
  });

  describe("toViewerResponseEvent", () => {
    it("converts a Request and Response to ViewerResponseEvent", () => {
      const request = new Request("https://example.test/test");
      const response = new Response("OK", {
        status: 201,
        statusText: "Created",
      });
      response.headers.set("content-type", "text/plain");

      const event = adapter.toViewerResponseEvent(request, response);

      assertIdentical(event.context.eventType, "viewer-response");
      assertObjectHasProperty(event.context, "requestId");
      assertIdentical(event.request.method, "GET");
      assertIdentical(event.response.statusCode, 201);
      assertIdentical(event.response.statusDescription, "Created");

      const headers = event.response.headers;
      assertObjectHasProperty(headers, "content-type");
      assertIdentical(headers["content-type"].value, "text/plain");
    });
  });

  describe("fromViewerRequestResult", () => {
    it("preserves Request when CFF returns a Request", () => {
      const originalRequest = new Request("https://example.test/old/path");
      const cffRequest = cloudFrontRequestFactory.make({
        method: "POST",
        uri: "/new/path",
      });

      const result = adapter.fromViewerRequestResult(
        cffRequest,
        originalRequest,
      );

      assertInstanceOf(result, Request);
      assertIdentical(result.method, "POST");
      const url = new URL(result.url);
      assertIdentical(url.pathname, "/new/path");
    });

    it("converts CFF Response to native Response", async () => {
      const originalRequest = new Request("https://example.test/test");
      const cffResponse = cloudFrontResponseFactory.make({
        statusCode: 403,
        statusDescription: "Forbidden",
        headers: { "x-custom-header": { value: "blocked" } },
      });

      const result = adapter.fromViewerRequestResult(
        cffResponse,
        originalRequest,
      );

      assertInstanceOf(result, Response);
      assertResponseStatus(result, 403, await describeResponse(result));
      assertIdentical(result.headers.get("x-custom-header"), "blocked");
    });
  });

  describe("fromViewerResponseResult", () => {
    it("converts CFF Response to native Response", async () => {
      const originalResponse = new Response("Original body");
      const cffResponse = cloudFrontResponseFactory.make({
        statusCode: 200,
        statusDescription: "OK",
        headers: { "content-type": { value: "application/json" } },
      });

      const result = adapter.fromViewerResponseResult(
        cffResponse,
        originalResponse,
      );

      assertInstanceOf(result, Response);
      assertResponseStatus(result, 200, await describeResponse(result));
      assertIdentical(result.headers.get("content-type"), "application/json");
    });
  });

  describe("cookie handling", () => {
    it("serializes cookies from native headers to CFF format", () => {
      const request = new Request("https://example.test/test");
      request.headers.set("cookie", "session=abc123; user=john");

      const event = adapter.toViewerRequestEvent(request);
      const cookies = event.request.cookies;

      assertIdentical(cookies["session"]?.value, "abc123");
      assertIdentical(cookies["user"]?.value, "john");
    });

    it("deserializes cookies back to native headers", () => {
      const originalResponse = new Response("Original body");
      const cffResponse = cloudFrontResponseFactory.make({
        statusCode: 200,
        headers: { "set-cookie": { value: "session=abc123; Path=/" } },
      });

      const result = adapter.fromViewerResponseResult(
        cffResponse,
        originalResponse,
      );

      assertIdentical(
        result.headers.get("set-cookie"),
        "session=abc123; Path=/",
      );
    });

    it("handles empty cookie names by skipping them", () => {
      const request = new Request("https://example.test/test");
      // Cookie header with trailing semicolon creating empty name
      request.headers.set("cookie", "session=abc123; =empty-name");

      const event = adapter.toViewerRequestEvent(request);
      const cookies = event.request.cookies;

      // Empty cookie name should be skipped
      assertObjectHasProperty(cookies, "session");
      assertIdentical(cookies.session.value, "abc123");
      assertTrue(!("" in cookies));
    });
  });

  describe("query string handling", () => {
    it("handles multi-value query parameters", () => {
      const request = new Request(
        "https://example.test/test?tag=red&tag=blue&size=large",
      );

      const event = adapter.toViewerRequestEvent(request);
      const queryString = event.request.querystring;

      assertObjectMatches(queryString, {
        tag: {
          value: "red",
          multiValue: [{ value: "red" }, { value: "blue" }],
        },
        size: { value: "large" },
      });
    });

    it("round-trips multi-value query parameters", () => {
      const originalRequest = new Request(
        "https://example.test/test?tag=a&tag=b&single=c",
      );

      const event = adapter.toViewerRequestEvent(originalRequest);
      const restoredRequest = adapter.fromViewerRequestResult(
        event.request,
        originalRequest,
      );

      assertInstanceOf(restoredRequest, Request);
      const url = new URL(restoredRequest.url);

      assertArrayIncludesAll(url.searchParams.getAll("tag"), ["a", "b"]);
      assertIdentical(url.searchParams.get("single"), "c");
    });
  });

  describe("base64 body encoding", () => {
    it("decodes base64-encoded response bodies", async () => {
      const originalRequest = new Request("https://example.test/test");
      const encodedBody = Buffer.from("Hello, world!").toString("base64");
      const cffResponse = cloudFrontResponseFactory.make({
        statusCode: 200,
        body: encodedBody,
        bodyEncoding: "base64",
      });

      const result = adapter.fromViewerRequestResult(
        cffResponse,
        originalRequest,
      );

      assertInstanceOf(result, Response);
      assertIdentical(await result.text(), "Hello, world!");
    });

    it("returns plain string response bodies when no encoding is specified", async () => {
      const originalRequest = new Request("https://example.test/test");
      const cffResponse = cloudFrontResponseFactory.make({
        statusCode: 200,
        body: "Plain text response",
      });

      const result = adapter.fromViewerRequestResult(
        cffResponse,
        originalRequest,
      );

      assertInstanceOf(result, Response);
      assertIdentical(await result.text(), "Plain text response");
    });
  });

  describe("request ID", () => {
    it("generates unique request IDs for each event", () => {
      const request = new Request("https://example.test/test");
      const response = new Response("OK");

      const requestEvent1 = adapter.toViewerRequestEvent(request);
      const requestEvent2 = adapter.toViewerRequestEvent(request);
      const responseEvent1 = adapter.toViewerResponseEvent(request, response);

      assertTypeString(requestEvent1.context.requestId);
      assertTypeString(responseEvent1.context.requestId);

      assertTrue(
        requestEvent1.context.requestId !== requestEvent2.context.requestId,
      );
      assertTrue(
        requestEvent1.context.requestId !== responseEvent1.context.requestId,
      );
    });
  });
});
