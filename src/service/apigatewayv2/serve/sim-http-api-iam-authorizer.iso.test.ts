import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2RequestContext } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const accountId = "888888888888";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

/**
 * A handler reporting its own requestContext, so a test can assert on what the
 * authorizer told it about the caller rather than only on the status.
 */
const reportContext = (event: {
  requestContext: SimPayload2RequestContext;
}): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext),
});

/**
 * A Role in the API's own Account, allowed to invoke one `execute-api`
 * resource.
 */
async function reporterRole(simAws: SimAws, resource: string): Promise<void> {
  const iam = simAws.iam();
  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Reporter",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Reporter",
      PolicyName: "InvokeOrders",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "execute-api:Invoke", Resource: resource },
      }),
    }),
  );
}

function get(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
  callerArn?: string,
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
    callerArn === undefined
      ? {}
      : { headers: { [simAwsCallerHeaderName]: callerArn } },
  );
}

describe("Authorizing a sim HTTP API route with AWS_IAM", () => {
  it("refuses an unsigned request and never invokes the integration", async () => {
    // Given an AWS_IAM route
    const simAws = new SimAws();
    let invocations = 0;
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        routeKeys: ["GET /orders/{orderId}"],
        handler: (): string => {
          invocations += 1;
          return "one order";
        },
      },
      simAws,
    );

    // When it is called with no credentials at all
    const response = await get(simAws, api, "/orders/42");

    // Then the request resolved to an anonymous caller, nothing allows that
    // caller anything, and the handler never ran
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(await response.text(), '{"message":"Forbidden"}');
    assertIdentical(invocations, 0);
  });

  it("admits a caller allowed execute-api:Invoke on the route", async () => {
    // Given an AWS_IAM route and a Role allowed to invoke it
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        routeKeys: ["GET /orders/{orderId}"],
        handler: (): string => "one order",
      },
      simAws,
    );
    await reporterRole(
      simAws,
      `arn:aws:execute-api:us-east-1:${accountId}:${api.apiId}` +
        `/$default/GET/orders/*`,
    );

    // When that Role calls it
    const response = await get(simAws, api, "/orders/42", reporterArn);

    // Then the handler ran
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '"one order"');
  });

  it("refuses a caller whose policies allow something else", async () => {
    // Given an AWS_IAM route and a Role allowed another API's routes
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { iamAuthorization: true, routeKeys: ["GET /orders/{orderId}"] },
      simAws,
    );
    await reporterRole(
      simAws,
      `arn:aws:execute-api:us-east-1:${accountId}:another01/*`,
    );

    // When that Role calls it
    const response = await get(simAws, api, "/orders/42", reporterArn);

    // Then being a known principal is not enough: nothing allows this route
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("lets an explicit Deny beat an Allow", async () => {
    // Given a Role allowed every API and denied this one route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { iamAuthorization: true, routeKeys: ["GET /orders/{orderId}"] },
      simAws,
    );
    await reporterRole(simAws, "*");
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "DenyOrders",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Effect: "Deny",
            Action: "execute-api:Invoke",
            Resource:
              `arn:aws:execute-api:us-east-1:${accountId}:${api.apiId}` +
              `/$default/GET/orders/*`,
          },
        }),
      }),
    );

    // When that Role calls the denied route
    const response = await get(simAws, api, "/orders/42", reporterArn);

    // Then the Deny wins, as it does in any IAM evaluation
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("describes the admitted caller in the event", async () => {
    // Given an admitted caller on an AWS_IAM route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        routeKeys: ["GET /orders/{orderId}"],
        handler: reportContext,
      },
      simAws,
    );
    await reporterRole(simAws, "*");

    // When the handler reads its invocation event
    const response = await get(simAws, api, "/orders/42", reporterArn);
    const context = (await response.json()) as SimPayload2RequestContext;

    // Then it can tell who called it and from which Account, which is the
    // point of the authorization type for handler code
    assertObjectMatches(context.authorizer?.iam ?? {}, {
      accountId,
      userArn: reporterArn,
    });
    assertIdentical(context.accountId, accountId);
  });

  it("still serves a NONE route on the same API to anyone", async () => {
    // Given an API with one IAM-authorized route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        routeKeys: ["GET /orders"],
        handler: reportContext,
      },
      simAws,
    );

    // And an open route alongside it, on the same integration
    const [integration] = api.integrations.list();
    assertNonNullable(integration);
    await simAws.apiGatewayV2().createRoute({
      input: {
        ApiId: api.apiId,
        RouteKey: "GET /health",
        Target: `integrations/${integration.integrationId}`,
        AuthorizationType: "NONE",
      },
    });

    // When each is called with nothing
    const protectedRoute = await get(simAws, api, "/orders");
    const openRoute = await get(simAws, api, "/health");
    const context = (await openRoute.json()) as SimPayload2RequestContext;

    // Then only the IAM route is closed, and the open one describes no caller
    assertResponseStatus(
      protectedRoute,
      403,
      await describeResponse(protectedRoute),
    );
    assertResponseStatus(openRoute, 200, await describeResponse(openRoute));
    assertUndefined(context.authorizer);
  });
});
