import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

/**
 * Serve one request and answer with the event the handler was given.
 */
async function eventFor(
  path: string,
  init?: RequestInit,
): Promise<SimElbV2Event> {
  const simAws = new SimAws();
  let received: SimElbV2Event | undefined;
  const loadBalancer = await simElbV2LambdaTargetFactory.make(
    {
      handler: (event: SimElbV2Event): SimElbV2Result => {
        received = event;
        return { statusCode: 200 };
      },
    },
    simAws,
  );

  await simElbV2Fetch(simAws, `http://${loadBalancer.dnsName}${path}`, init);

  assertDefined(received, "The target function was not invoked");

  return received;
}

describe("The event a sim ELBv2 load balancer invokes a function with", () => {
  it("names the target group in an elb request context", async () => {
    // Given a load balancer forwarding to a lambda target group

    // When a request reaches it
    const event = await eventFor("/orders");

    // Then the request context is ELB's own, carrying the target group ARN,
    // which is what tells this apart from an API Gateway event
    expect(event.requestContext).toStrictEqual({
      elb: {
        targetGroupArn:
          "arn:aws:elasticloadbalancing:us-east-1:888888888888:targetgroup/checkout-tg/0000000000000001",
      },
    });
  });

  it("carries the method and path as ELB's own fields", async () => {
    // Given a load balancer with a Lambda target

    // When a POST reaches a path on it
    const event = await eventFor("/orders/42", { method: "POST", body: "" });

    // Then the event names them flat, rather than under an http block
    assertIdentical(event.httpMethod, "POST");
    assertIdentical(event.path, "/orders/42");
  });

  it("keeps the last value of a repeated query parameter", async () => {
    // Given a load balancer whose target group leaves multi-value headers off,
    // which is what real ELB defaults to

    // When a request repeats a query string key
    const event = await eventFor("/orders?status=open&status=shipped&page=2");

    // Then the last value is the one the handler sees, as real ELB does
    // without the multi-value attribute, rather than the two joined
    expect(event.queryStringParameters).toStrictEqual({
      status: "shipped",
      page: "2",
    });
  });

  it("carries an empty query map when there was no query string", async () => {
    // Given a load balancer with a Lambda target

    // When a request carries no query string
    const event = await eventFor("/orders");

    // Then the field is present and empty, rather than left out as an API
    // Gateway event leaves it
    expect(event.queryStringParameters).toStrictEqual({});
  });

  it("writes the headers a load balancer adds", async () => {
    // Given a load balancer with a Lambda target

    // When a request carries a cookie and its own forwarding headers
    const event = await eventFor("/orders", {
      headers: {
        cookie: "session=abc",
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "curl/8.0.0",
      },
    });

    // Then the load balancer's own values replace what the client sent, the
    // host is the load balancer's DNS name, and the cookie stays in its header
    // rather than being lifted into a field of its own
    assertIdentical(
      event.headers["host"],
      "shop-alb-0000000001.us-east-1.elb.amazonaws.com",
    );
    assertIdentical(event.headers["x-forwarded-for"], "127.0.0.1");
    assertIdentical(event.headers["x-forwarded-port"], "80");
    assertIdentical(event.headers["x-forwarded-proto"], "http");
    assertIdentical(event.headers["cookie"], "session=abc");
    assertIdentical(event.headers["user-agent"], "curl/8.0.0");
    expect(event.headers["x-amzn-trace-id"]).toMatch(
      /^Root=1-[\da-f]{8}-[\da-f]{24}$/u,
    );
  });

  it("passes a text body through as it arrived", async () => {
    // Given a load balancer with a Lambda target

    // When a JSON request body arrives
    const event = await eventFor("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku: "abc" }),
    });

    // Then the handler reads the text of it
    assertIdentical(event.body, '{"sku":"abc"}');
    assertFalse(event.isBase64Encoded);
  });

  it("base64 encodes a form body, which ELB does not treat as text", async () => {
    // Given a load balancer with a Lambda target

    // When a form post arrives
    const event = await eventFor("/orders", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "sku=abc",
    });

    // Then it is base64, because ELB's list of text types is shorter than API
    // Gateway's and does not include this one
    assertTrue(event.isBase64Encoded);
    assertIdentical(Buffer.from(event.body, "base64").toString(), "sku=abc");
  });

  it("base64 encodes a body carrying a content encoding", async () => {
    // Given a load balancer with a Lambda target

    // When a body arrives compressed, whatever its content type says
    const event = await eventFor("/orders", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "content-encoding": "gzip",
      },
      body: "compressed",
    });

    // Then the content encoding decides, as it does on real ELB
    assertTrue(event.isBase64Encoded);
    assertIdentical(Buffer.from(event.body, "base64").toString(), "compressed");
  });

  it("carries an empty body rather than none for a request with none", async () => {
    // Given a load balancer with a Lambda target

    // When a GET with no body arrives
    const event = await eventFor("/orders");

    // Then the field is present and empty and is not called base64, which is
    // what a real ELB health check event shows too
    assertIdentical(event.body, "");
    assertFalse(event.isBase64Encoded);
  });
});
