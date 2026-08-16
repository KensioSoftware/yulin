import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { VariantFactory } from "@kensio/part-factory";
import { describe, expect, it } from "vitest";

import { lambdaFunctionUrlEventFactory } from "./lambda-function-url-event.factory.js";

describe("The Lambda Function URL invocation event factory", () => {
  it("makes an event a NONE auth Function URL would deliver", () => {
    // When an event is made with nothing said about the request
    const event = lambdaFunctionUrlEventFactory.make();

    // Then it is an anonymous GET / in payload format 2.0
    assertObjectMatches(event, {
      version: "2.0",
      routeKey: "$default",
      rawPath: "/",
      rawQueryString: "",
      isBase64Encoded: false,
      requestContext: {
        accountId: "anonymous",
        http: { method: "GET", path: "/", protocol: "HTTP/1.1" },
        routeKey: "$default",
        stage: "$default",
      },
    });

    // And the endpoint names itself as a Function URL of the default region
    assertStringIncludes(
      event.requestContext.domainName,
      ".lambda-url.us-east-1.on.aws",
    );
    assertIdentical(
      event.headers["host"],
      event.requestContext.domainName,
      "the host header names the endpoint",
    );

    // And the fields a Function URL invocation never carries are absent rather
    // than empty, as they are on AWS
    assertUndefined(event.queryStringParameters);
    assertUndefined(event.pathParameters);
    assertUndefined(event.stageVariables);
    assertUndefined(event.cookies);
    assertUndefined(event.body);
  });

  it("takes the path from either of the two fields carrying it", () => {
    // When one event names the path as the raw path and another names it in
    // the request context
    const rawPathEvent = lambdaFunctionUrlEventFactory.make({
      rawPath: "/user/status",
    });
    const contextEvent = lambdaFunctionUrlEventFactory.make({
      requestContext: { http: { path: "/user/status" } },
    });

    // Then both carry it in both places, as a real invocation does
    assertIdentical(rawPathEvent.rawPath, "/user/status");
    assertIdentical(rawPathEvent.requestContext.http.path, "/user/status");
    assertIdentical(contextEvent.rawPath, "/user/status");
    assertIdentical(contextEvent.requestContext.http.path, "/user/status");
  });

  it("parses the query the request was made with", () => {
    // When an event is made for a request carrying a query string
    const event = lambdaFunctionUrlEventFactory.make({
      rawPath: "/search",
      rawQueryString: "term=noodles&page=2&tag=a&tag=b",
    });

    // Then the parsed parameters are there too, with repeats joined by commas
    // as payload format 2.0 does
    expect(event.queryStringParameters).toStrictEqual({
      term: "noodles",
      page: "2",
      tag: "a,b",
    });
  });

  it("builds the raw query string from parsed parameters", () => {
    // When an event names the query as parsed parameters instead
    const event = lambdaFunctionUrlEventFactory.make({
      queryStringParameters: { term: "noodles" },
    });

    // Then the raw query string a handler might read is there as well
    assertIdentical(event.rawQueryString, "term=noodles");
    expect(event.queryStringParameters).toStrictEqual({ term: "noodles" });
  });

  it("keeps the endpoint's identity in step with its hostname", () => {
    // When an event names the endpoint by its URL id
    const event = lambdaFunctionUrlEventFactory.make({
      requestContext: { apiId: "abcdefghij" },
    });

    // Then the hostname, the domain prefix and the host header are that
    // endpoint's, rather than some other Function URL's
    assertIdentical(event.requestContext.domainPrefix, "abcdefghij");
    assertIdentical(
      event.requestContext.domainName,
      "abcdefghij.lambda-url.us-east-1.on.aws",
    );
    assertIdentical(
      event.headers["host"],
      "abcdefghij.lambda-url.us-east-1.on.aws",
    );
  });

  it("names the endpoint from an overridden hostname", () => {
    // When an event names the endpoint by its hostname instead
    const event = lambdaFunctionUrlEventFactory.make({
      requestContext: {
        domainName: "klmnopqrst.lambda-url.eu-west-2.on.aws",
      },
    });

    // Then the URL id the request context reports is that endpoint's
    assertIdentical(event.requestContext.apiId, "klmnopqrst");
    assertIdentical(event.requestContext.domainPrefix, "klmnopqrst");
  });

  it("reports the caller's user agent and address in both places", () => {
    // When an event describes the caller through the request context
    const event = lambdaFunctionUrlEventFactory.make({
      requestContext: {
        http: { sourceIp: "203.0.113.1", userAgent: "yulin-test/1.0" },
      },
    });

    // Then the headers a handler might read them from agree with it
    assertIdentical(event.headers["x-forwarded-for"], "203.0.113.1");
    assertIdentical(event.headers["user-agent"], "yulin-test/1.0");
  });

  it("takes the caller's user agent and address from the headers", () => {
    // When an event describes the caller through the headers instead
    const event = lambdaFunctionUrlEventFactory.make({
      headers: {
        "user-agent": "curl/8.7.1",
        "x-forwarded-for": "198.51.100.9",
      },
    });

    // Then the request context describes the same caller
    assertIdentical(event.requestContext.http.userAgent, "curl/8.7.1");
    assertIdentical(event.requestContext.http.sourceIp, "198.51.100.9");
  });

  it("stamps the invocation time in both the formats the event carries", () => {
    // Given the instant an invocation is to be stamped with
    const at = new Date("2020-03-12T19:03:58.390Z");

    // When an event is made for it
    const event = lambdaFunctionUrlEventFactory.make({
      requestContext: { timeEpoch: at.getTime() },
    });

    // Then the Common Log Format stamp is the same instant
    assertIdentical(event.requestContext.time, "12/Mar/2020:19:03:58 +0000");
    assertIdentical(event.requestContext.timeEpoch, at.getTime());
  });

  it("composes into a named variation of a request", () => {
    // Given a variant factory for the form posts an application receives
    const formPostFactory = new VariantFactory(lambdaFunctionUrlEventFactory, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      requestContext: { http: { method: "POST" } },
    });

    // When one is made for a particular path and body
    const event = formPostFactory.make({
      rawPath: "/subscribe",
      body: "email=someone%40yulin.test",
    });

    // Then the variant's preset request is there alongside what this one said
    assertObjectMatches(event, {
      rawPath: "/subscribe",
      body: "email=someone%40yulin.test",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      requestContext: { http: { method: "POST", path: "/subscribe" } },
    });
  });

  it("makes an event that stands in for a served invocation", () => {
    // Given a handler reading the request off the event, as one served by a
    // simulated Function URL would
    const handler = (event: {
      requestContext: { http: { method: string } };
      queryStringParameters?: Record<string, string> | undefined;
    }): string =>
      `${event.requestContext.http.method} ${event.queryStringParameters?.["name"] ?? "world"}`;

    // When it is called with a made event
    const greeting = handler(
      lambdaFunctionUrlEventFactory.make({
        rawPath: "/greet",
        rawQueryString: "name=Yulin",
      }),
    );

    // Then it read what the request said
    assertIdentical(greeting, "GET Yulin");
  });
});
