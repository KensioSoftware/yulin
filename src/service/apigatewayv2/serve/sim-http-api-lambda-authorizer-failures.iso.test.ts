import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApiProxyRequestAuthorizer } from "../api/sim-http-api-proxy-request-authorizer.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const cookie = "session=valid";

interface AuthorizedApi {
  readonly api: SimHttpApi;
  /** How many times the route's integration handler ran. */
  readonly invocations: () => number;
}

async function protectedApi(
  simAws: SimAws,
  authorizer: Partial<SimHttpApiProxyRequestAuthorizer>,
): Promise<AuthorizedApi> {
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
        handler: (): unknown => ({ isAuthorized: true }),
        identitySource: ["$request.header.cookie"],
        enableSimpleResponses: true,
        invokePermission: true,
        ...authorizer,
      },
    },
    simAws,
  );

  return { api, invocations: () => invocations };
}

function get(simAws: SimAws, api: SimHttpApi): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}/account` }).toString(),
    { headers: { cookie } },
  );
}

describe("When a sim HTTP API Lambda authorizer cannot answer", () => {
  it("answers 500 for an authorizer that throws", async () => {
    // Given an authorizer whose function fails
    const simAws = new SimAws();
    const { api, invocations } = await protectedApi(simAws, {
      handler: (): unknown => {
        throw new Error("no session store");
      },
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then the caller is told nothing about it, as with a failed integration,
    // and the integration never ran
    assertIdentical(response.status, 500);
    assertIdentical(
      await response.text(),
      '{"message":"Internal Server Error"}',
    );
    assertIdentical(invocations(), 0);
  });

  it("answers 500 for a simple response with no answer in it", async () => {
    // Given an authorizer configured for simple responses that returns
    // something else
    const simAws = new SimAws();
    const { api } = await protectedApi(simAws, {
      handler: (): unknown => ({ allowed: true }),
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then API Gateway could not read the answer either, so it is a 500
    // rather than a refusal the caller could act on
    assertIdentical(response.status, 500);
  });

  it("answers 500 for a policy response missing its policy", async () => {
    // Given an authorizer answering policies that returns only a principal
    const simAws = new SimAws();
    const { api } = await protectedApi(simAws, {
      enableSimpleResponses: false,
      handler: (): unknown => ({ principalId: "user-1" }),
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then the response is not the shape the authorizer was configured for
    assertIdentical(response.status, 500);
  });

  it("answers 500 for a policy document IAM cannot read", async () => {
    // Given an authorizer returning a document with no statements at all
    const simAws = new SimAws();
    const { api } = await protectedApi(simAws, {
      enableSimpleResponses: false,
      handler: (): unknown => ({
        principalId: "user-1",
        policyDocument: { Version: "2012-10-17" },
      }),
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then the malformed document is the authorizer failing rather than the
    // authorizer saying no
    assertIdentical(response.status, 500);
  });

  it("answers 500 for an authorizer returning nothing at all", async () => {
    // Given an authorizer whose function returns no value
    const simAws = new SimAws();
    const { api } = await protectedApi(simAws, {
      handler: (): unknown => undefined,
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then there is nothing to read, which is neither response format
    assertIdentical(response.status, 500);
  });

  it("answers 500 for an authorizer naming a function that is not there", async () => {
    // Given an authorizer pointed at a function nothing created
    const simAws = new SimAws();
    const { api } = await protectedApi(simAws, {
      uri: "arn:aws:lambda:eu-west-2:111111111111:function:gone",
    });

    // When the route is called
    const response = await get(simAws, api);

    // Then it is discovered the way real API Gateway discovers it, when it
    // tries to invoke it
    assertIdentical(response.status, 500);
  });

  it("needs an invoke permission of the authorizer's own", async () => {
    // Given an authorizer whose function granted the API nothing
    const simAws = new SimAws();
    const { api, invocations } = await protectedApi(simAws, {
      invokePermission: false,
    });
    const { accountId, regionName } = api.accountRegionScope;
    const executeApiArn = `arn:aws:execute-api:${regionName}:${accountId}:${api.apiId}`;

    // When the route is called, then again once the function grants the API
    // the invoke action for the route being called, and again once it grants
    // it for the authorizer itself
    const ungranted = await get(simAws, api);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "session-authorizer",
        StatementId: "route-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `${executeApiArn}/$default/GET/account`,
      }),
    );
    const routeGranted = await get(simAws, api);
    const [authorizer] = api.authorizers.list();
    assertNonNullable(authorizer);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "session-authorizer",
        StatementId: "authorizer-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `${executeApiArn}/authorizers/${authorizer.authorizerId}`,
      }),
    );
    const authorizerGranted = await get(simAws, api);

    // Then only the grant naming the authorizer opens it: an authorizer is
    // invoked under an ARN of its own rather than under the route's, and the
    // integration ran only once, behind the request that got through
    assertIdentical(ungranted.status, 500);
    assertIdentical(routeGranted.status, 500);
    assertIdentical(authorizerGranted.status, 200);
    assertIdentical(invocations(), 1);
  });
});
