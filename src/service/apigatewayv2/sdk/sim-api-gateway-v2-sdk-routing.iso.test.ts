import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteApiCommand,
  DeleteAuthorizerCommand,
  DeleteIntegrationCommand,
  DeleteRouteCommand,
  DeleteStageCommand,
  GetApiCommand,
  GetApisCommand,
  GetAuthorizersCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand,
  ImportApiCommand,
  UpdateApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "../openapi/sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "../openapi/sim-http-api-openapi-integration.factory.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:orders";

describe("Intercepting an ApiGatewayV2 SDK client", () => {
  it("routes every simulated Command to simulated API Gateway v2", async () => {
    // Given a real SDK client intercepted into a simulated AWS
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    const client = new ApiGatewayV2Client({ region: "eu-west-2" });
    simSdk.intercept(client);

    // When a whole API is built through the client
    const created = await client.send(
      new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
    );
    const apiId = created.ApiId ?? "";
    const integration = await client.send(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: functionArn,
        PayloadFormatVersion: "2.0",
      }),
    );
    const authorizer = await client.send(
      new CreateAuthorizerCommand({
        ApiId: apiId,
        Name: "pool-authorizer",
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        JwtConfiguration: {
          Issuer:
            "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_abc123",
          Audience: ["client-1"],
        },
      }),
    );
    await client.send(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: `integrations/${integration.IntegrationId ?? ""}`,
        AuthorizationType: "JWT",
        AuthorizerId: authorizer.AuthorizerId,
      }),
    );
    await client.send(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // Then the simulation answered, in the Region the client is configured for
    assertIdentical(
      created.ApiEndpoint,
      `https://${apiId}.execute-api.eu-west-2.amazonaws.com`,
    );

    // And reading it back through the client finds what was built
    const fetched = await client.send(new GetApiCommand({ ApiId: apiId }));
    assertIdentical(fetched.Name, "orders");
    const apis = await client.send(new GetApisCommand({}));
    expect(apis.Items?.map((api) => api.ApiId)).toStrictEqual([apiId]);
    const integrations = await client.send(
      new GetIntegrationsCommand({ ApiId: apiId }),
    );
    assertIdentical(integrations.Items?.length, 1);
    const routes = await client.send(new GetRoutesCommand({ ApiId: apiId }));
    assertIdentical(routes.Items?.[0]?.RouteKey, "$default");
    const authorizers = await client.send(
      new GetAuthorizersCommand({ ApiId: apiId }),
    );
    assertIdentical(authorizers.Items?.[0]?.Name, "pool-authorizer");
    const stages = await client.send(new GetStagesCommand({ ApiId: apiId }));
    assertIdentical(stages.Items?.[0]?.StageName, "$default");

    // And deleting through the client takes things away again, routes before
    // the integration they target
    await client.send(
      new DeleteRouteCommand({
        ApiId: apiId,
        RouteId: routes.Items[0].RouteId,
      }),
    );
    await client.send(
      new DeleteIntegrationCommand({
        ApiId: apiId,
        IntegrationId: integration.IntegrationId,
      }),
    );
    await client.send(
      new DeleteStageCommand({ ApiId: apiId, StageName: "$default" }),
    );
    await client.send(
      new DeleteAuthorizerCommand({
        ApiId: apiId,
        AuthorizerId: authorizer.AuthorizerId,
      }),
    );
    const emptied = await client.send(new GetRoutesCommand({ ApiId: apiId }));
    expect(emptied.Items).toStrictEqual([]);

    await client.send(new DeleteApiCommand({ ApiId: apiId }));
    const remaining = await client.send(new GetApisCommand({}));
    expect(remaining.Items).toStrictEqual([]);
  });

  it("routes an ImportApi Command through the client", async () => {
    // Given a real SDK client intercepted into a simulated AWS
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    const client = new ApiGatewayV2Client({ region: "eu-west-2" });
    simSdk.intercept(client);

    // When an OpenAPI document is imported through it
    const integration = simHttpApiOpenApiIntegrationFactory.make({
      functionArn,
      regionName: "eu-west-2",
    });
    const body = JSON.stringify(
      simHttpApiOpenApiDocumentFactory.make({
        paths: {
          "/orders": {
            get: { "x-amazon-apigateway-integration": integration },
          },
        },
      }),
    );
    const imported = await client.send(new ImportApiCommand({ Body: body }));

    // Then the simulation answered, with the route the document declared
    assertIdentical(imported.Name, "orders");
    const routes = await client.send(
      new GetRoutesCommand({ ApiId: imported.ApiId }),
    );
    assertIdentical(routes.Items?.[0]?.RouteKey, "GET /orders");
  });

  it("says which Commands it supports when sent one it does not", async () => {
    // Given a real SDK client intercepted into a simulated AWS
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    const client = new ApiGatewayV2Client({ region: "eu-west-2" });
    simSdk.intercept(client);

    // When an unsimulated Command is sent
    // Then it fails with what is supported rather than reaching the network
    await expect(
      client.send(new UpdateApiCommand({ ApiId: "abcdefghij", Name: "x" })),
    ).rejects.toThrow(/does not support SDK Command UpdateApiCommand/);
  });
});
