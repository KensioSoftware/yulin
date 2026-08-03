import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApiProxyRequestAuthorizer } from "../api/sim-http-api-proxy-request-authorizer.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * The cookie the authorizers below accept, and the one they do not.
 */
const goodCookie = "session=valid";
const badCookie = "session=expired";

/**
 * An integration handler reporting what the authorizer passed on to it, so a
 * test can assert on the context rather than only on the status.
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

/**
 * An authorizer answering the simple format, allowing only the good cookie.
 */
function simpleAuthorizer(): (event: { identitySource: string[] }) => unknown {
  return (event) => ({
    isAuthorized: event.identitySource[0] === "session=valid",
    context: { tenant: "acme", plan: "pro" },
  });
}

/**
 * An authorizer answering a policy, allowing only the good cookie.
 */
function policyAuthorizer(): (event: {
  identitySource: string[];
  routeArn: string;
}) => unknown {
  return (event) => ({
    principalId: "user-1",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect:
            event.identitySource[0] === "session=valid" ? "Allow" : "Deny",
          Action: "execute-api:Invoke",
          Resource: event.routeArn,
        },
      ],
    },
    context: { tenant: "acme" },
  });
}

async function protectedApi(
  simAws: SimAws,
  authorizer: Partial<SimHttpApiProxyRequestAuthorizer>,
): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      routeKeys: ["GET /account"],
      handler: contextHandler(),
      requestAuthorizer: {
        functionName: "session-authorizer",
        handler: simpleAuthorizer(),
        identitySource: ["$request.header.cookie"],
        enableSimpleResponses: true,
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
  headers: Record<string, string> = {},
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}/account` }).toString(),
    { headers },
  );
}

describe("Authorizing a sim HTTP API route with a Lambda REQUEST authorizer", () => {
  it("lets a request its authorizer accepts through to the handler", async () => {
    // Given a route behind an authorizer that reads the session cookie
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {});

    // When the route is called with a cookie it accepts
    const response = await get(simAws, api, { cookie: goodCookie });

    // Then the handler ran, and it saw the context the authorizer returned
    assertIdentical(response.status, 200);
    assertObjectMatches(await response.json(), {
      tenant: "acme",
      plan: "pro",
    });
  });

  it("refuses a request its authorizer says no to, without invoking the integration", async () => {
    // Given a route behind that authorizer, and a handler counting its runs
    const simAws = new SimAws();
    let invocations = 0;
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        routeKeys: ["GET /account"],
        handler: (): string => {
          invocations += 1;
          return "account";
        },
        requestAuthorizer: {
          functionName: "session-authorizer",
          handler: simpleAuthorizer(),
          identitySource: ["$request.header.cookie"],
          enableSimpleResponses: true,
          invokePermission: true,
        },
      },
      simAws,
    );

    // When the route is called with a cookie the authorizer does not accept
    const response = await get(simAws, api, { cookie: badCookie });

    // Then the request is forbidden and the integration never ran
    assertIdentical(response.status, 403);
    assertIdentical(await response.text(), '{"message":"Forbidden"}');
    assertIdentical(invocations, 0);
  });

  it("evaluates the policy document an authorizer answers with", async () => {
    // Given an authorizer answering a policy rather than a plain yes or no
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {
      handler: policyAuthorizer(),
      enableSimpleResponses: false,
    });

    // When the route is called with each cookie
    const allowed = await get(simAws, api, { cookie: goodCookie });
    const denied = await get(simAws, api, { cookie: badCookie });

    // Then IAM's reading of the document decides, and the context still
    // reaches the handler
    assertIdentical(allowed.status, 200);
    assertObjectMatches(await allowed.json(), { tenant: "acme" });
    assertIdentical(denied.status, 403);
  });

  it("refuses a policy allowing some other route", async () => {
    // Given an authorizer allowing a route other than the one being called
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {
      enableSimpleResponses: false,
      handler: (): unknown => ({
        principalId: "user-1",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "execute-api:Invoke",
              Resource:
                "arn:aws:execute-api:eu-west-2:111111111111:*/$default/GET/orders",
            },
          ],
        },
      }),
    });

    // When the account route is called with an accepted cookie
    const response = await get(simAws, api, { cookie: goodCookie });

    // Then the policy does not reach this route, so the request is refused
    assertIdentical(response.status, 403);
  });

  it("answers 401 for the one message that asks for one", async () => {
    // Given an authorizer answering the way a function signals Unauthorized
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {
      handler: (): unknown => ({ errorMessage: "Unauthorized" }),
    });

    // When the route is called
    const response = await get(simAws, api, { cookie: goodCookie });

    // Then the request is unauthorized rather than forbidden, which is the
    // only way an authorizer produces a 401
    assertIdentical(response.status, 401);
    assertIdentical(await response.text(), '{"message":"Unauthorized"}');
  });

  it("admits a request an authorizer allowed without any context", async () => {
    // Given an authorizer that says yes and passes nothing on
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {
      handler: (): unknown => ({ isAuthorized: true }),
    });

    // When the route is called
    const response = await get(simAws, api, { cookie: goodCookie });

    // Then the handler ran, and the authorizer block is there with nothing in
    // it rather than missing, so a handler can still tell what admitted it
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "null");
  });

  it("reads every identity source, and refuses a request missing one", async () => {
    // Given an authorizer reading a header and a query string parameter
    const simAws = new SimAws();
    let invocations = 0;
    const api = await protectedApi(simAws, {
      identitySource: ["$request.header.cookie", "$request.querystring.tenant"],
      handler: (event): unknown => {
        invocations += 1;
        return { isAuthorized: true, context: { seen: event.identitySource } };
      },
    });

    // When a request carries both, and when one carries only the cookie
    const simAwsHttp = new SimAwsHttp({ simAws });
    const both = await simAwsHttp.fetch(
      new SimAwsLocalUrl({
        input: `${api.apiEndpoint}/account?tenant=acme`,
      }).toString(),
      { headers: { cookie: goodCookie } },
    );
    const missing = await get(simAws, api, { cookie: goodCookie });

    // Then the authorizer saw both values, and the request missing one was
    // refused without the function being invoked a second time
    assertIdentical(both.status, 200);
    assertObjectMatches(await both.json(), { seen: [goodCookie, "acme"] });
    assertIdentical(missing.status, 401);
    assertIdentical(invocations, 1);
  });

  it("refuses every request once the route's authorizer is deleted", async () => {
    // Given a route whose authorizer is then deleted
    const simAws = new SimAws();
    const api = await protectedApi(simAws, {});
    const [authorizer] = api.authorizers.list();
    await simAws.apiGatewayV2().deleteAuthorizer({
      input: { ApiId: api.apiId, AuthorizerId: authorizer?.authorizerId },
    });

    // When a cookie that worked before is presented
    const response = await get(simAws, api, { cookie: goodCookie });

    // Then the route stays closed rather than falling open
    assertIdentical(response.status, 401);
  });
});
