import {
  assertFalse,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimHttpApiAuthorizerEvent } from "./auth/sim-http-api-authorizer-event.js";

/**
 * An authorizer that admits everything and hands the event it received to the
 * integration, so a test can assert on what an authorizer sees.
 */
function echoAuthorizer(): (event: SimHttpApiAuthorizerEvent) => unknown {
  return (event) => ({ isAuthorized: true, context: { event } });
}

/**
 * An API whose one route reports the authorizer event back as its response.
 */
async function echoingApi(
  simAws: SimAws,
  routeKeys: readonly string[] = ["GET /account"],
  stageVariables: Record<string, string> = {},
): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      routeKeys,
      stageVariables,
      handler: (event: SimPayload2Event): unknown => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          event.requestContext.authorizer?.lambda?.["event"] ?? null,
        ),
      }),
      requestAuthorizer: {
        functionName: "session-authorizer",
        handler: echoAuthorizer(),
        identitySource: ["$request.header.cookie"],
        enableSimpleResponses: true,
        invokePermission: true,
      },
    },
    simAws,
  );
}

async function authorizerEvent(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
  init: RequestInit = {},
): Promise<SimHttpApiAuthorizerEvent> {
  const response = await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
    { headers: { cookie: "session=valid" }, ...init },
  );

  return (await response.json()) as SimHttpApiAuthorizerEvent;
}

describe("The event a sim HTTP API Lambda authorizer receives", () => {
  it("is the payload 2.0 request event with the three authorizer members", async () => {
    // Given a route behind a Lambda authorizer
    const simAws = new SimAws();
    const api = await echoingApi(simAws);

    // When it is called with a query string
    const event = await authorizerEvent(simAws, api, "/account?tenant=acme");

    // Then the authorizer saw the request, the route it matched as an ARN, and
    // the values found at its identity sources
    const { accountId, regionName } = api.accountRegionScope;
    assertObjectMatches(event, {
      version: "2.0",
      type: "REQUEST",
      routeArn:
        `arn:aws:execute-api:${regionName}:${accountId}:${api.apiId}` +
        `/$default/GET/account`,
      identitySource: ["session=valid"],
      routeKey: "GET /account",
      rawPath: "/account",
      rawQueryString: "tenant=acme",
      queryStringParameters: { tenant: "acme" },
    });
    assertIdentical(event.requestContext.apiId, api.apiId);
  });

  it("names the route key rather than the path asked for", async () => {
    // Given a parameterised route behind the same authorizer
    const simAws = new SimAws();
    const api = await echoingApi(simAws, ["GET /orders/{orderId}"]);

    // When a concrete order is asked for
    const event = await authorizerEvent(simAws, api, "/orders/42");

    // Then the route ARN carries the template with its braces intact, which is
    // the form AWS's own example of this event shows, and the captured
    // parameter arrives separately
    expect(event.routeArn).toMatch(/\/\$default\/GET\/orders\/\{orderId\}$/u);
    assertObjectMatches(event, { pathParameters: { orderId: "42" } });
  });

  it("carries the stage variables the request was served under", async () => {
    // Given a stage carrying a variable
    const simAws = new SimAws();
    const api = await echoingApi(simAws, ["GET /account"], {
      table: "accounts-dev",
    });

    // When the route is called
    const event = await authorizerEvent(simAws, api, "/account");

    // Then the authorizer sees it, as the integration behind the route does
    assertObjectMatches(event, { stageVariables: { table: "accounts-dev" } });
  });

  it("carries no request body", async () => {
    // Given a route behind the same authorizer
    const simAws = new SimAws();
    const api = await echoingApi(simAws, ["POST /account"]);

    // When a request with a body reaches it
    const event = await authorizerEvent(simAws, api, "/account", {
      method: "POST",
      headers: { cookie: "session=valid", "content-type": "text/plain" },
      body: "a body",
    });

    // Then the authorizer sees no body, which is what AWS's published example
    // of this event carries, and the integration behind the route still gets
    // the request in full
    assertFalse(Object.hasOwn(event, "body"));
    assertFalse(Object.hasOwn(event, "isBase64Encoded"));
  });
});
