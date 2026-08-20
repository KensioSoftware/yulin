import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApiLambdaProxyInput } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

const goodToken = "Bearer session-6";

/**
 * An authorizer counting its own invocations, so a test can tell a held
 * decision from a fresh one, and reporting the count in its context, so the
 * handler can see which invocation the decision came from.
 */
function countingAuthorizer(
  effect: "Allow" | "Deny" = "Allow",
): (event: { methodArn: string }) => unknown {
  let invocations = 0;

  return (event) => {
    invocations += 1;

    return {
      principalId: "user-6",
      context: { invocations },
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: effect,
            Resource: event.methodArn,
          },
        ],
      },
    };
  };
}

/**
 * A method reporting the authorizer's context back, so a test sees which
 * decision served the request.
 */
const contextHandler = (event: SimPayload1Event): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext.authorizer ?? null),
});

async function cachingApi(
  simAws: SimAws,
  input: Partial<SimRestApiLambdaProxyInput> = {},
): Promise<SimRestApi> {
  return await simRestApiLambdaProxyFactory.make(
    {
      resourcePaths: ["/orders", "/invoices"],
      handler: contextHandler,
      authorizerHandler: countingAuthorizer(),
      authorizerResultTtlSeconds: 300,
      ...input,
    },
    simAws,
  );
}

function get(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
  token: string = goodToken,
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}${path}`,
    }).toString(),
    { headers: { authorization: token } },
  );
}

describe("Caching a sim REST API Lambda authorizer's decision", () => {
  it("serves a second request from the decision already made", async () => {
    // Given a method behind a TOKEN authorizer holding its decisions for 5
    // minutes
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws);

    // When the same token is presented twice
    const first = await get(simAws, restApi, "/orders");
    const second = await get(simAws, restApi, "/orders");

    // Then the authorizer ran once, and both requests were served by that one
    // decision, context and all
    assertIdentical(first.status, 200);
    assertIdentical(second.status, 200);
    assertObjectMatches(await first.json(), { invocations: 1 });
    assertObjectMatches(await second.json(), { invocations: 1 });
  });

  it("decides separately for a different token", async () => {
    // Given a method behind that authorizer
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws);

    // When two callers present different tokens
    const ada = await get(simAws, restApi, "/orders", "Bearer ada");
    const grace = await get(simAws, restApi, "/orders", "Bearer grace");

    // Then each got a decision of its own, since a TOKEN authorizer is keyed
    // on the token it was handed
    assertObjectMatches(await ada.json(), { invocations: 1 });
    assertObjectMatches(await grace.json(), { invocations: 2 });
  });

  it("decides separately for different identity source values", async () => {
    // Given a REQUEST authorizer identifying its callers by two headers
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws, {
      authorizerHandler: undefined,
      requestAuthorizerHandler: countingAuthorizer(),
      authorizerIdentitySource:
        "method.request.header.X-Tenant,method.request.header.Authorization",
    });
    const call = async (tenant: string): Promise<Response> =>
      await new SimAwsHttp({ simAws }).fetch(
        new SimAwsLocalUrl({
          input: `${restApi.invokeUrl("prod")}/orders`,
        }).toString(),
        { headers: { "x-tenant": tenant, authorization: goodToken } },
      );

    // When the same token arrives for two tenants, and one of them twice
    const acme = await call("acme");
    const other = await call("globex");
    const acmeAgain = await call("acme");

    // Then each set of values got a decision of its own, and the repeat came
    // from the one already made for it
    assertObjectMatches(await acme.json(), { invocations: 1 });
    assertObjectMatches(await other.json(), { invocations: 2 });
    assertObjectMatches(await acmeAgain.json(), { invocations: 1 });
  });

  it("decides separately for each method the token reaches", async () => {
    // Given two methods behind one authorizer
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws);

    // When the same token reaches each of them
    const orders = await get(simAws, restApi, "/orders");
    const invoices = await get(simAws, restApi, "/invoices");

    // Then each method got a decision of its own: what is held is the answer
    // the policy gave about one method ARN, and it says nothing about another
    assertObjectMatches(await orders.json(), { invocations: 1 });
    assertObjectMatches(await invoices.json(), { invocations: 2 });
  });

  it("invokes the authorizer again once the decision expires", async () => {
    // Given a decision already made and reused
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws);
    await get(simAws, restApi, "/orders");
    const reused = await get(simAws, restApi, "/orders");

    // When simulated time passes the TTL
    await simAws.clock().advanceBy({ minutes: 6 });
    const expired = await get(simAws, restApi, "/orders");

    // Then the authorizer is asked again rather than the test having to wait
    assertObjectMatches(await reused.json(), { invocations: 1 });
    assertObjectMatches(await expired.json(), { invocations: 2 });
  });

  it("holds a refusal the way it holds an admission", async () => {
    // Given an authorizer refusing the method it is asked about
    const simAws = new SimAws();
    let invocations = 0;
    const denying = countingAuthorizer("Deny");
    const restApi = await cachingApi(simAws, {
      authorizerHandler: (event) => {
        invocations += 1;
        return denying(event);
      },
    });

    // When the same token is presented twice
    const first = await get(simAws, restApi, "/orders");
    const second = await get(simAws, restApi, "/orders");

    // Then both are refused, and the authorizer was asked once: AWS holds
    // whatever answer it got
    assertIdentical(first.status, 403);
    assertIdentical(second.status, 403);
    assertIdentical(invocations, 1);
  });

  it("holds nothing for an authorizer that could not answer", async () => {
    // Given an authorizer whose function fails
    const simAws = new SimAws();
    let invocations = 0;
    const restApi = await cachingApi(simAws, {
      authorizerHandler: (): unknown => {
        invocations += 1;
        throw new Error("no session store");
      },
    });

    // When the same token is presented twice
    const first = await get(simAws, restApi, "/orders");
    const second = await get(simAws, restApi, "/orders");

    // Then both answer 500 and the function was asked each time: there is no
    // answer to hold, and the next request may find it working
    assertIdentical(first.status, 500);
    assertIdentical(second.status, 500);
    assertIdentical(invocations, 2);
  });

  it("invokes the authorizer every time when nothing is held", async () => {
    // Given an authorizer holding nothing, which is what AWS defaults one to
    const simAws = new SimAws();
    const restApi = await cachingApi(simAws, { authorizerResultTtlSeconds: 0 });

    // When the same token is presented twice
    const first = await get(simAws, restApi, "/orders");
    const second = await get(simAws, restApi, "/orders");

    // Then the authorizer decided each request on its own
    assertObjectMatches(await first.json(), { invocations: 1 });
    assertObjectMatches(await second.json(), { invocations: 2 });
  });
});
