import {
  CreateDeploymentCommand,
  GetAuthorizersCommand,
  ImportRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { simApiGatewayServicePrincipal } from "../sim-api-gateway-service-principal.js";
import type { SimRestApiTokenAuthorizerEvent } from "../serve/auth/sim-rest-api-authorizer-event.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  simRestApiInvokePermission,
  simRestApiProxyFunction,
} from "../api/sim-rest-api-proxy-function.js";
import { simRestApiOpenApiDocumentFactory } from "./sim-rest-api-openapi-document.factory.js";
import { simRestApiOpenApiIntegrationFactory } from "./sim-rest-api-openapi-integration.factory.js";

const functionName = "pets";
const functionAccountId = "888888888888";

describe("Serving a request through an imported sim REST API", () => {
  it("routes a request to the function the document named", async () => {
    // Given a function, and a document declaring a parameterised path in front
    // of it
    const simAws = new SimAws();
    const functionArn = await simRestApiProxyFunction(simAws, {
      functionAccountId,
      functionName,
      roleArn: "arn:aws:iam::888888888888:role/PetsRole",
      handler: (event: SimPayload1Event): unknown => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `pet ${event.pathParameters?.["petId"] ?? "none"}`,
      }),
    });
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets/{petId}": {
          get: {
            "x-amazon-apigateway-integration":
              simRestApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
    });

    // When the document is imported and the API is deployed to a stage
    const body = new TextEncoder().encode(JSON.stringify(document));
    const imported = await simAws
      .apiGateway()
      .importRestApi(new ImportRestApiCommand({ body }));
    await simRestApiInvokePermission(
      simAws,
      { functionAccountId, functionName },
      imported.id,
    );
    const deployment = new CreateDeploymentCommand({
      restApiId: imported.id,
      stageName: "prod",
    });
    await simAws.apiGateway().createDeployment(deployment);

    // Then a request to the imported path reaches the function, with the path
    // parameter the template names
    const restApi = simAws.apiGateway().findRestApi(imported.id);
    assertNonNullable(restApi);
    const url = new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/pets/42`,
    });
    const response = await new SimAwsHttp({ simAws }).fetch(url.toString());

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "pet 42");
  });

  it("sends a request through the authorizer the document declared", async () => {
    // Given a function behind the API, a second one deciding who may call it,
    // and a document declaring the second as a token authorizer's scheme
    const simAws = new SimAws();
    const functionArn = await simRestApiProxyFunction(simAws, {
      functionAccountId,
      functionName,
      roleArn: "arn:aws:iam::888888888888:role/PetsRole",
      handler: (): unknown => ({ statusCode: 200, body: "pets" }),
    });
    const authorizerArn = await simRestApiProxyFunction(simAws, {
      functionAccountId,
      functionName: "pet-authorizer",
      roleArn: "arn:aws:iam::888888888888:role/PetsRole",
      handler: (event: SimRestApiTokenAuthorizerEvent): unknown => ({
        principalId: "pet-owner",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Action: "execute-api:Invoke",
              Effect:
                event.authorizationToken === "Bearer session-6"
                  ? "Allow"
                  : "Deny",
              Resource: event.methodArn,
            },
          ],
        },
      }),
    });
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": {
          get: {
            security: [{ "pet-authorizer": [] }],
            "x-amazon-apigateway-integration":
              simRestApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
      components: {
        securitySchemes: {
          "pet-authorizer": {
            type: "apiKey",
            name: "Authorization",
            in: "header",
            "x-amazon-apigateway-authtype": "custom",
            "x-amazon-apigateway-authorizer": {
              type: "token",
              authorizerUri: authorizerArn,
            },
          },
        },
      },
    });

    // When the document is imported, both functions admit the API and it is
    // deployed to a stage
    const body = new TextEncoder().encode(JSON.stringify(document));
    const imported = await simAws
      .apiGateway()
      .importRestApi(new ImportRestApiCommand({ body }));
    await simRestApiInvokePermission(
      simAws,
      { functionAccountId, functionName },
      imported.id,
    );
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    const { accountId, regionName } =
      simAws.accountRegionScope().accountRegionScope;
    await simAws
      .account(functionAccountId)
      .lambda()
      .addPermission(
        new AddPermissionCommand({
          FunctionName: "pet-authorizer",
          StatementId: "api-gateway-invoke-authorizer",
          Action: "lambda:InvokeFunction",
          Principal: simApiGatewayServicePrincipal,
          SourceArn:
            `arn:aws:execute-api:${regionName}:${accountId}:` +
            `${imported.id}/authorizers/${authorizer.id}`,
        }),
      );
    await simAws.apiGateway().createDeployment(
      new CreateDeploymentCommand({
        restApiId: imported.id,
        stageName: "prod",
      }),
    );

    // Then the imported method sends its requests through that authorizer,
    // which decides them by the token the scheme's own header carried
    const restApi = simAws.apiGateway().findRestApi(imported.id);
    assertNonNullable(restApi);
    const url = new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/pets`,
    }).toString();
    const http = new SimAwsHttp({ simAws });

    const refused = await http.fetch(url, {
      headers: { authorization: "Bearer expired" },
    });
    assertIdentical(refused.status, 403);

    const served = await http.fetch(url, {
      headers: { authorization: "Bearer session-6" },
    });
    assertIdentical(served.status, 200);
    assertIdentical(await served.text(), "pets");
  });
});
