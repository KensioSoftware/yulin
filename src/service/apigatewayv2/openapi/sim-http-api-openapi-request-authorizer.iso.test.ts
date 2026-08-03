import {
  CreateStageCommand,
  GetAuthorizersCommand,
  GetRoutesCommand,
  ImportApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const unusedFunctionArn =
  "arn:aws:lambda:us-east-1:111111111111:function:session-authorizer";

/**
 * The security scheme an HTTP API declares a Lambda `REQUEST` authorizer with:
 * an `apiKey` scheme carrying an authorizer of type `request`.
 */
function requestScheme(functionArn = unusedFunctionArn): JSONObject {
  return {
    type: "apiKey",
    name: "cookie",
    in: "header",
    "x-amazon-apigateway-authorizer": {
      type: "request",
      identitySource: "$request.header.cookie",
      authorizerUri:
        `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/` +
        `${functionArn}/invocations`,
      authorizerPayloadFormatVersion: "2.0",
      enableSimpleResponses: true,
      authorizerResultTtlInSeconds: 300,
    },
  };
}

/**
 * A document whose one operation is protected by the scheme under test.
 */
function protectedDocument(
  scheme: JSONObject = requestScheme(),
  integrationArn = "arn:aws:lambda:us-east-1:111111111111:function:account",
): string {
  return JSON.stringify(
    simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/account": {
          get: {
            security: [{ "session-authorizer": [] }],
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make({
                functionArn: integrationArn,
              }),
          },
        },
      },
      components: { securitySchemes: { "session-authorizer": scheme } },
    }),
  );
}

/**
 * One of the two functions the imported API invokes, with the grant API
 * Gateway needs before it may invoke it.
 */
async function invokableFunction(
  simAws: SimAws,
  functionName: string,
  handler: (event: never) => unknown,
): Promise<string> {
  const created = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: `arn:aws:iam::111111111111:role/${functionName}`,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "api-gateway-invoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
    }),
  );

  return created.FunctionArn;
}

describe("Importing a sim HTTP API's Lambda REQUEST authorizers", () => {
  it("creates the authorizer the scheme declares, on a CUSTOM route", async () => {
    // Given a document whose operation names an apiKey scheme carrying a
    // request authorizer
    const simAws = new SimAws();

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: protectedDocument() }));

    // Then the scheme key is the authorizer's name, and everything the
    // extension declared reached it
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    const [authorizer] = authorizers.Items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.Name, "session-authorizer");
    assertIdentical(authorizer.AuthorizerType, "REQUEST");
    assertIdentical(authorizer.AuthorizerUri, unusedFunctionArn);
    assertTrue(authorizer.EnableSimpleResponses);
    assertIdentical(authorizer.AuthorizerResultTtlInSeconds, 300);
    expect(authorizer.IdentitySource).toStrictEqual(["$request.header.cookie"]);

    // And the operation's route is a CUSTOM one pointed at it, rather than the
    // JWT one a token authorizer produces
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    const [route] = routes.Items;
    assertNonNullable(route);
    assertIdentical(route.AuthorizationType, "CUSTOM");
    assertIdentical(route.AuthorizerId, authorizer.AuthorizerId);
  });

  it("reads more than one identity source, which a JWT authorizer refuses", async () => {
    // Given a scheme naming a header and a query string parameter
    const simAws = new SimAws();
    const scheme = requestScheme();
    const authorizer = {
      ...(scheme["x-amazon-apigateway-authorizer"] as JSONObject),
      identitySource: "$request.header.cookie, $request.querystring.tenant",
    };

    // When it is imported
    const { ApiId: apiId } = await simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: protectedDocument({
          ...scheme,
          "x-amazon-apigateway-authorizer": authorizer,
        }),
      }),
    );

    // Then both arrived, as a REQUEST authorizer requires every source it names
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    expect(authorizers.Items[0]?.IdentitySource).toStrictEqual([
      "$request.header.cookie",
      "$request.querystring.tenant",
    ]);
  });

  it("serves the imported route through the authorizer's function", async () => {
    // Given the two functions and the imported API, with the stage an import
    // does not create
    const simAws = new SimAws();
    const authorizerArn = await invokableFunction(
      simAws,
      "session-authorizer",
      (event: { identitySource: string[] }): unknown => ({
        isAuthorized: event.identitySource[0] === "session=valid",
        context: { tenant: "acme" },
      }),
    );
    const accountArn = await invokableFunction(
      simAws,
      "account",
      (event: {
        requestContext: { authorizer?: { lambda?: { tenant?: string } } };
      }): unknown => ({
        statusCode: 200,
        body: event.requestContext.authorizer?.lambda?.tenant ?? "none",
      }),
    );
    const body = protectedDocument(requestScheme(authorizerArn), accountArn);
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: body }));
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When the route is called with a cookie the authorizer refuses, and then
    // with one it accepts
    const url = new SimAwsLocalUrl({
      input: `${apiEndpoint}/account`,
    }).toString();
    const http = new SimAwsHttp({ simAws });
    const refused = await http.fetch(url, {
      headers: { cookie: "session=expired" },
    });
    const admitted = await http.fetch(url, {
      headers: { cookie: "session=valid" },
    });

    // Then the imported authorizer decided both, and the context it returned
    // reached the handler
    assertIdentical(refused.status, 403);
    assertIdentical(admitted.status, 200);
    assertIdentical(await admitted.text(), "acme");
  });
});
