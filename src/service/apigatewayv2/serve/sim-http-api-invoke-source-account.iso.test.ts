import {
  AddPermissionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

function localUrl(api: SimHttpApi, path: string): string {
  return new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString();
}

describe("The source Account an HTTP API invokes its function with", () => {
  it("allows a permission naming the API's own Account", async () => {
    // Given an API whose function grants the invoke action to the Account the
    // API belongs to
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { invokePermission: false, handler: (): string => "orders" },
      simAws,
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceAccount: api.accountRegionScope.accountId,
      }),
    );

    // When a request reaches the route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the API supplies that Account, so the condition matches
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("refuses a permission naming another Account", async () => {
    // Given a grant conditioned on an Account the API does not belong to
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
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceAccount: "222222222222",
      }),
    );

    // When a request reaches the route
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api, "/orders"),
    );

    // Then the grant belongs to another Account's API, so this one is answered
    // the way a missing permission is
    assertResponseStatus(response, 500, await describeResponse(response));
    assertIdentical(invocations, 0);
  });

  it("names the API's Account rather than the function's", async () => {
    // Given an API whose integrated function belongs to another Account, and a
    // grant on that function naming the function's own Account
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
    const otherAccountLambda = simAws.account("222222222222").lambda();
    await otherAccountLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "own-account-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceAccount: "222222222222",
      }),
    );

    // When a request is served with that grant, and again once the function
    // names the API's Account instead
    const simAwsHttp = new SimAwsHttp({ simAws });
    const ownAccount = await simAwsHttp.fetch(localUrl(api, "/orders"));
    await otherAccountLambda.removePermission(
      new RemovePermissionCommand({
        FunctionName: "orders",
        StatementId: "own-account-invoke",
      }),
    );
    await otherAccountLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-account-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceAccount: api.accountRegionScope.accountId,
      }),
    );
    const apiAccount = await simAwsHttp.fetch(localUrl(api, "/orders"));

    // Then the source Account is the one the request arrives in, which is the
    // API's rather than the function's
    assertResponseStatus(ownAccount, 500, await describeResponse(ownAccount));
    assertResponseStatus(apiAccount, 200, await describeResponse(apiAccount));
  });
});
