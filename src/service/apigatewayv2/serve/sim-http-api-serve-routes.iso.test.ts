import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(apiEndpoint: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

describe("Matching a served sim HTTP API request to a route", () => {
  it("gives the handler the route it matched and what it captured", async () => {
    // Given an API routing several keys onto one function
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["GET /pets", "GET /pets/{petId}", "ANY /admin/{proxy+}"],
      },
      simAws,
    );

    // When a request matches the parameterised route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/pets/6"),
    );

    // Then the handler is told which route took it, and the segment the
    // parameter matched reaches it as a path parameter
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.routeKey, "GET /pets/{petId}");
    assertIdentical(event.requestContext.routeKey, "GET /pets/{petId}");
    expect(event.pathParameters).toStrictEqual({ petId: "6" });
  });

  it("captures the rest of the path into a greedy parameter", async () => {
    // Given an API with a greedy route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["ANY /admin/{proxy+}"] },
      simAws,
    );

    // When a request reaches past the literal part of it
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/admin/reports/2026/07"),
      { method: "POST" },
    );

    // Then the remainder is captured with no leading slash, and ANY took a
    // method no exact route named
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.routeKey, "ANY /admin/{proxy+}");
    expect(event.pathParameters).toStrictEqual({ proxy: "reports/2026/07" });
  });

  it("leaves path parameters out of the event when a route captures none", async () => {
    // Given an API with a literal route and a catch-all
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets", "$default"] },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });

    // When each of them serves a request
    const literal = await http.fetch(localUrl(api.apiEndpoint, "/pets"));
    const catchAll = await http.fetch(localUrl(api.apiEndpoint, "/orders"));

    // Then neither event carries the field, rather than carrying an empty one
    const literalEvent = (await literal.json()) as SimPayload2Event;
    const catchAllEvent = (await catchAll.json()) as SimPayload2Event;
    assertIdentical(literalEvent.routeKey, "GET /pets");
    assertUndefined(literalEvent.pathParameters);
    assertIdentical(catchAllEvent.routeKey, "$default");
    assertUndefined(catchAllEvent.pathParameters);
  });

  it("answers 404 for a method no route of the path has", async () => {
    // Given an API routing one method of one path, with no ANY route, no
    // greedy route and no catch-all to pick the request up
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"] },
      simAws,
    );

    // When that path is requested with another method
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/pets"),
      { method: "DELETE" },
    );

    // Then it is a 404 rather than a 405: an HTTP API matches a route or it
    // does not, and a method that matches no route is no match
    assertIdentical(response.status, 404);
    expect(await response.json()).toStrictEqual({ message: "Not Found" });
  });

  it("answers 404 for a path no route matches", async () => {
    // Given an API with one route and no catch-all
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets/{petId}"] },
      simAws,
    );

    // When a request goes deeper than that route's one parameter
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/pets/6/toys"),
    );

    // Then nothing serves it
    assertIdentical(response.status, 404);
  });

  it("routes AWS's worked example through a served endpoint", async () => {
    // Given the five routes AWS documents the selection order with
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: [
          "GET /pets/dog/1",
          "GET /pets/dog/{id}",
          "GET /pets/{proxy+}",
          "ANY /{proxy+}",
          "$default",
        ],
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });

    // When each of AWS's example requests is served
    const responses = await Promise.all([
      http.fetch(localUrl(api.apiEndpoint, "/pets/dog/1")),
      http.fetch(localUrl(api.apiEndpoint, "/pets/dog/2")),
      http.fetch(localUrl(api.apiEndpoint, "/pets/cat/1")),
      http.fetch(localUrl(api.apiEndpoint, "/test/5"), { method: "POST" }),
    ]);
    const events = (await Promise.all(
      responses.map(async (response) => response.json()),
    )) as SimPayload2Event[];

    // Then each reaches the route AWS says it does
    expect(events.map((event) => event.routeKey)).toStrictEqual([
      "GET /pets/dog/1",
      "GET /pets/dog/{id}",
      "GET /pets/{proxy+}",
      "ANY /{proxy+}",
    ]);
  });
});
