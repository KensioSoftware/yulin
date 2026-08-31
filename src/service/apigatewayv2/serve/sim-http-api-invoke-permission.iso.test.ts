import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

function localUrl(api: SimHttpApi, path: string): string {
  return new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString();
}

/**
 * The `execute-api` ARN prefix a permission for this API is written with,
 * without the stage and route part.
 */
function executeApiArn(api: SimHttpApi, suffix: string): string {
  const { accountId, regionName } = api.accountRegionScope;

  return `arn:aws:execute-api:${regionName}:${accountId}:${api.apiId}/${suffix}`;
}

/**
 * Grant the API permission to invoke the function, for one source ARN.
 */
async function grantInvoke(simAws: SimAws, sourceArn?: string): Promise<void> {
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "orders",
      StatementId: "api-gateway-invoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      ...(sourceArn !== undefined && { SourceArn: sourceArn }),
    }),
  );
}

describe("Invoking a sim HTTP API integration's function", () => {
  it("refuses a route whose function granted it no permission", async () => {
    // Given an API whose function has no resource policy at all
    const simAws = new SimAws();
    let invocations = 0;
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        handler: (): string => {
          invocations += 1;
          return "orders";
        },
      },
      simAws,
    );

    // When a request reaches the route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the API answers as real API Gateway does when the invoke
    // permission is missing, and the handler never ran
    assertResponseStatus(response, 500, await describeResponse(response));
    expect(await response.json()).toStrictEqual({
      message: "Internal Server Error",
    });
    assertIdentical(invocations, 0);
  });

  it("allows a permission granted with no source ARN", async () => {
    // Given a function granting the API Gateway service principal the invoke
    // action for anything
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { invokePermission: false, handler: (): string => "orders" },
      simAws,
    );
    await grantInvoke(simAws);

    // When a request reaches the route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the unconditioned grant admits it
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("refuses a permission naming a different route", async () => {
    // Given a grant for one route of the API
    const simAws = new SimAws();
    let invocations = 0;
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        routeKeys: ["GET /orders", "GET /refunds"],
        handler: (): string => {
          invocations += 1;
          return "orders";
        },
      },
      simAws,
    );
    await grantInvoke(simAws, executeApiArn(api, "$default/GET/orders"));

    // When a request reaches the other route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/refunds"),
    );

    // Then the source ARN of the request does not match the grant
    assertResponseStatus(response, 500, await describeResponse(response));
    assertIdentical(invocations, 0);
  });

  it("names the route key template in the source ARN", async () => {
    // Given a grant written the way CDK writes one for a parameterised route,
    // with the parameter braces intact
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        routeKeys: ["GET /orders/{orderId}"],
        handler: (): string => "one order",
      },
      simAws,
    );
    await grantInvoke(simAws, executeApiArn(api, "*/*/orders/{orderId}"));

    // When a request supplies a concrete path parameter
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders/42"),
    );

    // Then the source ARN is built from the route key rather than from the
    // path asked for, so the grant matches
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("names the request's own method in the source ARN", async () => {
    // Given a grant naming a concrete method, on a route serving any method
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        routeKeys: ["ANY /orders"],
        handler: (): string => "orders",
      },
      simAws,
    );
    await grantInvoke(simAws, executeApiArn(api, "$default/POST/orders"));

    // When a POST reaches the route
    const posted = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
      { method: "POST" },
    );

    // And when a GET reaches the same route
    const fetched = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the method in the ARN is the request's, not the route key's `ANY`
    assertResponseStatus(posted, 200, await describeResponse(posted));
    assertResponseStatus(fetched, 500, await describeResponse(fetched));
  });

  it("collapses the catch-all route to $default in the source ARN", async () => {
    // Given a `$default` route and the grant CDK writes, which wildcards the
    // stage and the route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { invokePermission: false, handler: (): string => "anything" },
      simAws,
    );
    await grantInvoke(simAws, executeApiArn(api, "*/*"));

    // When a request reaches it
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the ARN is `<apiId>/<stage>/$default`, which those two wildcards
    // match
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("asks the function's own Account, not the API's", async () => {
    // Given an API whose integrated function belongs to another Account
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        functionAccountId: "222222222222",
        roleArn: "arn:aws:iam::222222222222:role/OrdersRole",
        handler: (): string => "orders",
      },
      simAws,
    );
    const otherAccount = simAws.account("222222222222");

    // When the request is refused, and again once that Account's function
    // grants the API the invoke action
    const simAwsHttp = new SimAwsHttp({ simAws });
    const ungranted = await simAwsHttp.fetch(localUrl(api, "/orders"));
    await otherAccount.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: executeApiArn(api, "*/*"),
      }),
    );
    const granted = await simAwsHttp.fetch(localUrl(api, "/orders"));

    // Then the grant on the function decides, and the source ARN still names
    // the API's Account rather than the function's
    assertResponseStatus(ungranted, 500, await describeResponse(ungranted));
    assertResponseStatus(granted, 200, await describeResponse(granted));
  });

  it("names the stage that served the request", async () => {
    // Given an API with a named stage, and a grant for that stage only
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        invokePermission: false,
        routeKeys: ["GET /orders"],
        stageNames: ["dev", "prod"],
        handler: (): string => "orders",
      },
      simAws,
    );
    await grantInvoke(simAws, executeApiArn(api, "dev/GET/orders"));

    // When each stage serves the same route
    const simAwsHttp = new SimAwsHttp({ simAws });
    const development = await simAwsHttp.fetch(localUrl(api, "/dev/orders"));
    const production = await simAwsHttp.fetch(localUrl(api, "/prod/orders"));

    // Then only the stage the grant names may invoke the function
    assertResponseStatus(development, 200, await describeResponse(development));
    assertResponseStatus(production, 500, await describeResponse(production));
  });
});
