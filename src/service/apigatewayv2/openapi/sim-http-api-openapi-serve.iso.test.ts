import {
  CreateStageCommand,
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
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simCognitoSignedInFactory } from "../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

/**
 * The scope a Cognito sign-in through the user pool API puts in a token.
 */
const adminScope = "aws.cognito.signin.user.admin";

/**
 * A handler reporting what the route captured and what the authorizer said, so
 * a test can assert on the event rather than only on the status.
 */
const handler = (event: {
  routeKey: string;
  pathParameters?: Record<string, string>;
  requestContext: { authorizer?: { jwt?: { scopes?: string[] } } };
}): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    routeKey: event.routeKey,
    pathParameters: event.pathParameters ?? null,
    scopes: event.requestContext.authorizer?.jwt?.scopes ?? null,
  }),
});

/**
 * A simulated Lambda function every imported route here proxies to, with the
 * grant an HTTP API integration needs before it serves anything.
 */
async function ordersFunction(simAws: SimAws): Promise<string> {
  const { FunctionArn: functionArn } = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "orders",
      StatementId: "api-gateway-invoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
    }),
  );

  return functionArn;
}

describe("Serving a sim HTTP API imported from an OpenAPI document", () => {
  it("answers 404 until a stage is created for the imported API", async () => {
    // Given an imported API with a path parameter in its one route
    const simAws = new SimAws();
    const functionArn = await ordersFunction(simAws);
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders/{orderId}": {
          get: {
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
    });
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // When the route is called before any stage exists
    const url = new SimAwsLocalUrl({
      input: `${apiEndpoint}/orders/42`,
    }).toString();
    const beforeStage = await new SimAwsHttp({ simAws }).fetch(url);

    // And once a stage is created separately, as an import creates none
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );
    const afterStage = await new SimAwsHttp({ simAws }).fetch(url);

    // Then the API answered nothing until it had a stage, and then served the
    // route the document declared, with what the path template captured
    assertIdentical(beforeStage.status, 404);
    assertIdentical(afterStage.status, 200);
    assertObjectMatches((await afterStage.json()) as JSONObject, {
      routeKey: "GET /orders/{orderId}",
      pathParameters: { orderId: "42" },
    });
  });

  it("protects an operation carrying a security requirement", async () => {
    // Given a pool with a signed-in user, and a document whose operation names
    // a JWT authorizer trusting that pool
    const simAws = new SimAws();
    const functionArn = await ordersFunction(simAws);
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "pool-authorizer": [adminScope] }],
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
      components: {
        securitySchemes: {
          "pool-authorizer": {
            type: "oauth2",
            "x-amazon-apigateway-authorizer": {
              type: "jwt",
              identitySource: "$request.header.Authorization",
              jwtConfiguration: {
                issuer: signedIn.issuerUrl,
                audience: [signedIn.clientId],
              },
            },
          },
        },
      },
    });
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When the route is called without a token, and then with one
    const url = new SimAwsLocalUrl({
      input: `${apiEndpoint}/orders`,
    }).toString();
    const anonymous = await new SimAwsHttp({ simAws }).fetch(url);
    const authorized = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { authorization: `Bearer ${signedIn.accessToken}` },
    });

    // Then the imported route is closed to a caller with no token and open to
    // one whose token the authorizer accepts
    assertIdentical(anonymous.status, 401);
    assertIdentical(authorized.status, 200);
    assertObjectMatches((await authorized.json()) as JSONObject, {
      scopes: [adminScope],
    });

    // And the requirement's scope list is the route's own AuthorizationScopes
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    const [route] = routes.Items;
    assertNonNullable(route);
    assertIdentical(route.AuthorizationType, "JWT");
    expect(route.AuthorizationScopes).toStrictEqual([adminScope]);
  });

  it("refuses a token claiming none of the requirement's scopes", async () => {
    // Given an operation asking for a scope no simulated flow issues
    const simAws = new SimAws();
    const functionArn = await ordersFunction(simAws);
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "pool-authorizer": ["orders.write"] }],
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
      components: {
        securitySchemes: {
          "pool-authorizer": {
            type: "oauth2",
            "x-amazon-apigateway-authorizer": {
              type: "jwt",
              identitySource: "$request.header.Authorization",
              jwtConfiguration: {
                issuer: signedIn.issuerUrl,
                audience: [signedIn.clientId],
              },
            },
          },
        },
      },
    });
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When an accepted access token is presented
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiEndpoint}/orders` }).toString(),
      { headers: { authorization: `Bearer ${signedIn.accessToken}` } },
    );

    // Then the answer is 403 rather than 401: the token was accepted, and the
    // scopes the document asked for do not allow this route
    assertIdentical(response.status, 403);
  });

  it("serves a request whose body contradicts a schema the document declares", async () => {
    // Given an operation declaring a required request body
    const simAws = new SimAws();
    const functionArn = await ordersFunction(simAws);
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          post: {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["orderId"],
                    properties: { orderId: { type: "string" } },
                  },
                },
              },
            },
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
    });
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When a request is sent whose body the schema would reject
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiEndpoint}/orders` }).toString(),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nothing: "declared" }),
      },
    );

    // Then it still reaches the handler, because HTTP APIs validate no
    // requests and the schema was ignored at import
    assertIdentical(response.status, 200);
  });
});
