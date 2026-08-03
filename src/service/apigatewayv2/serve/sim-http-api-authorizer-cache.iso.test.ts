import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApiProxyRequestAuthorizer } from "../api/sim-http-api-proxy-request-authorizer.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const goodCookie = "session=valid";

/**
 * An authorizer counting its own invocations, so a test can tell a cached
 * decision from a fresh one, and reporting the count in its context, so the
 * handler can see which invocation the decision came from.
 */
function countingAuthorizer(): (event: {
  identitySource: string[];
}) => unknown {
  let invocations = 0;

  return (event) => {
    invocations += 1;

    return {
      isAuthorized: (event.identitySource[0]?.length ?? 0) > 0,
      context: { invocations },
    };
  };
}

/**
 * A route reporting the authorizer's context back, so a test sees which
 * decision served the request.
 */
function contextHandler(): (event: {
  requestContext: { authorizer?: { lambda?: unknown } };
}) => unknown {
  return (event) => ({
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event.requestContext.authorizer?.lambda ?? null),
  });
}

async function cachingApi(
  simAws: SimAws,
  authorizer: Partial<SimHttpApiProxyRequestAuthorizer> = {},
  routeKeys: readonly string[] = ["GET /account"],
): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      routeKeys,
      handler: contextHandler(),
      requestAuthorizer: {
        functionName: "session-authorizer",
        handler: countingAuthorizer(),
        identitySource: ["$request.header.cookie"],
        enableSimpleResponses: true,
        resultTtlSeconds: 300,
        invokePermission: true,
        ...authorizer,
      },
    },
    simAws,
  );
}

function get(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
  cookie: string = goodCookie,
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
    { headers: { cookie } },
  );
}

describe("Caching a sim HTTP API Lambda authorizer's decision", () => {
  it("serves a second request from the decision already made", async () => {
    // Given a route behind an authorizer holding its decisions for 5 minutes
    const simAws = new SimAws();
    const api = await cachingApi(simAws);

    // When the same cookie is presented twice
    const first = await get(simAws, api, "/account");
    const second = await get(simAws, api, "/account");

    // Then the authorizer ran once, and both requests were served by that one
    // decision, context and all
    assertIdentical(first.status, 200);
    assertIdentical(second.status, 200);
    assertObjectMatches(await first.json(), { invocations: 1 });
    assertObjectMatches(await second.json(), { invocations: 1 });
  });

  it("decides separately for different identity source values", async () => {
    // Given a route behind that authorizer
    const simAws = new SimAws();
    const api = await cachingApi(simAws);

    // When two callers present different cookies
    const ada = await get(simAws, api, "/account", "session=ada");
    const grace = await get(simAws, api, "/account", "session=grace");

    // Then each got a decision of its own, since the cache is keyed on what
    // the identity sources found
    assertObjectMatches(await ada.json(), { invocations: 1 });
    assertObjectMatches(await grace.json(), { invocations: 2 });
  });

  it("tells two values apart by the whitespace around them", async () => {
    // Given an authorizer reading the query string, which is where a value
    // keeps its whitespace: HTTP strips the space around a header value
    // before anything here sees it
    const simAws = new SimAws();
    const api = await cachingApi(simAws, {
      identitySource: ["$request.querystring.token"],
    });
    const call = async (token: string): Promise<Response> =>
      await new SimAwsHttp({ simAws }).fetch(
        new SimAwsLocalUrl({
          input: `${api.apiEndpoint}/account?token=${token}`,
        }).toString(),
      );

    // When two callers present values differing only in their whitespace
    const bare = await call("ada");
    const padded = await call("%20ada%20");

    // Then each got a decision of its own: the value reaches the authorizer as
    // the client sent it, so what is around it is part of it
    assertObjectMatches(await bare.json(), { invocations: 1 });
    assertObjectMatches(await padded.json(), { invocations: 2 });
  });

  it("holds nothing for an authorizer that could not answer", async () => {
    // Given an authorizer whose function fails
    const simAws = new SimAws();
    let invocations = 0;
    const api = await cachingApi(simAws, {
      handler: (): unknown => {
        invocations += 1;
        throw new Error("no session store");
      },
    });

    // When the same cookie is presented twice
    const first = await get(simAws, api, "/account");
    const second = await get(simAws, api, "/account");

    // Then both answer 500 and the function was asked each time: there is no
    // answer to hold, and the next request may find it working
    assertIdentical(first.status, 500);
    assertIdentical(second.status, 500);
    assertIdentical(invocations, 2);
  });

  it("invokes the authorizer again once the decision expires", async () => {
    // Given a decision already made and reused
    const simAws = new SimAws();
    const api = await cachingApi(simAws);
    await get(simAws, api, "/account");
    const reused = await get(simAws, api, "/account");

    // When simulated time passes the TTL
    await simAws.clock().advanceBy({ minutes: 6 });
    const expired = await get(simAws, api, "/account");

    // Then the authorizer is asked again rather than the test having to wait
    assertObjectMatches(await reused.json(), { invocations: 1 });
    assertObjectMatches(await expired.json(), { invocations: 2 });
  });

  it("holds a refusal the way it holds an admission", async () => {
    // Given an authorizer that refuses a cookie it does not recognise
    const simAws = new SimAws();
    let invocations = 0;
    const api = await cachingApi(simAws, {
      handler: (): unknown => {
        invocations += 1;
        return { isAuthorized: false };
      },
    });

    // When the same unrecognised cookie is presented twice
    const first = await get(simAws, api, "/account", "unknown=1");
    const second = await get(simAws, api, "/account", "unknown=1");

    // Then both are refused, and the authorizer was asked once: AWS holds
    // whatever answer it got
    assertIdentical(first.status, 403);
    assertIdentical(second.status, 403);
    assertIdentical(invocations, 1);
  });

  it("covers every route of the API using the authorizer", async () => {
    // Given two routes behind one authorizer
    const simAws = new SimAws();
    const api = await cachingApi(simAws, {}, ["GET /account", "GET /orders"]);

    // When the same cookie reaches each of them
    const account = await get(simAws, api, "/account");
    const orders = await get(simAws, api, "/orders");

    // Then one decision served both, which is what AWS warns a cached
    // authorizer does: the key holds no route
    assertObjectMatches(await account.json(), { invocations: 1 });
    assertObjectMatches(await orders.json(), { invocations: 1 });
  });

  it("caches per route once $context.routeKey is an identity source", async () => {
    // Given the same two routes, behind an authorizer that also reads the
    // route the request matched
    const simAws = new SimAws();
    const api = await cachingApi(
      simAws,
      { identitySource: ["$request.header.cookie", "$context.routeKey"] },
      ["GET /account", "GET /orders"],
    );

    // When the same cookie reaches each of them, and one of them twice
    const account = await get(simAws, api, "/account");
    const orders = await get(simAws, api, "/orders");
    const accountAgain = await get(simAws, api, "/account");

    // Then each route got a decision of its own, and the repeat still came
    // from the one already made for that route
    assertObjectMatches(await account.json(), { invocations: 1 });
    assertObjectMatches(await orders.json(), { invocations: 2 });
    assertObjectMatches(await accountAgain.json(), { invocations: 1 });
  });

  it("invokes the authorizer every time when nothing is cached", async () => {
    // Given an authorizer that holds nothing, which is what AWS defaults one to
    const simAws = new SimAws();
    const api = await cachingApi(simAws, { resultTtlSeconds: 0 });

    // When the same cookie is presented twice
    const first = await get(simAws, api, "/account");
    const second = await get(simAws, api, "/account");

    // Then the authorizer decided each request on its own
    assertObjectMatches(await first.json(), { invocations: 1 });
    assertObjectMatches(await second.json(), { invocations: 2 });
  });
});
