import {
  assertIdentical,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { SimPayload2Endpoint } from "./sim-payload-2-endpoint.js";
import { SimPayload2EventBuilder } from "./sim-payload-2-event-builder.js";

const endpoint: SimPayload2Endpoint = {
  apiId: "abcdefghij",
  domainName: "abcdefghij.execute-api.eu-west-2.amazonaws.com",
  domainPrefix: "abcdefghij",
  routeKey: "GET /orders/{orderId}",
  stage: "live",
};

describe("The payload format 2.0 event builder", () => {
  it("carries the route's path parameters and the stage's variables", async () => {
    // Given an endpoint whose route captured a path parameter, on a stage with
    // variables of its own
    const builder = new SimPayload2EventBuilder();

    // When an event is built for a request to it
    const event = await builder.build(
      new Request("https://orders.example.test/orders/YL-1"),
      {
        ...endpoint,
        pathParameters: { orderId: "YL-1" },
        stageVariables: { catalogue: "v2" },
      },
    );

    // Then the handler reads both off the event, and the route and stage are
    // the ones the endpoint named rather than $default
    expect(event.pathParameters).toStrictEqual({ orderId: "YL-1" });
    expect(event.stageVariables).toStrictEqual({ catalogue: "v2" });
    assertIdentical(event.routeKey, "GET /orders/{orderId}");
    assertIdentical(event.requestContext.stage, "live");
  });

  it("leaves out the fields a request has nothing for", async () => {
    // Given an endpoint with no path parameters and no stage variables
    const builder = new SimPayload2EventBuilder();

    // When an event is built for a request with no query, cookies or body
    const event = await builder.build(
      new Request("https://orders.example.test/orders"),
      endpoint,
    );

    // Then those fields are absent rather than empty, as they are on AWS
    assertUndefined(event.pathParameters);
    assertUndefined(event.stageVariables);
    assertUndefined(event.queryStringParameters);
    assertUndefined(event.cookies);
    assertUndefined(event.body);

    // And the raw query string is still there, as the empty string
    assertIdentical(event.rawQueryString, "");
  });

  it("stamps the event from the clock it was given", async () => {
    // Given a builder with a stopped clock
    const instant = new Date("2020-03-12T19:03:58.390Z");
    const builder = new SimPayload2EventBuilder({
      clock: new SimFixedClock(instant),
    });

    // When an event is built
    const event = await builder.build(
      new Request("https://orders.example.test/orders"),
      endpoint,
    );

    // Then the request context and the trace header describe that instant
    assertIdentical(event.requestContext.timeEpoch, instant.getTime());
    assertIdentical(event.requestContext.time, "12/Mar/2020:19:03:58 +0000");
    assertStringIncludes(
      event.headers["x-amzn-trace-id"] ?? "",
      "Root=1-5e6a879e-",
    );
  });
});
