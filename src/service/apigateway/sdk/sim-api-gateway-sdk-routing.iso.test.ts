import {
  APIGatewayClient,
  CreateDeploymentCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  CreateStageCommand,
  DeleteMethodCommand,
  DeleteResourceCommand,
  DeleteRestApiCommand,
  DeleteStageCommand,
  GetIntegrationCommand,
  GetMethodCommand,
  GetResourceCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  GetRestApisCommand,
  GetStageCommand,
  GetStagesCommand,
  PutIntegrationCommand,
  PutMethodCommand,
  UpdateRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:orders";

describe("Intercepting an API Gateway SDK client", () => {
  it("routes every simulated Command to simulated API Gateway", async () => {
    // Given a real SDK client intercepted into a simulated AWS
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    const client = new APIGatewayClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    // When a whole REST API is built through the client
    const created = await client.send(
      new CreateRestApiCommand({ name: "orders" }),
    );
    const restApiId = created.id ?? "";
    const resource = await client.send(
      new CreateResourceCommand({
        restApiId,
        parentId: created.rootResourceId,
        pathPart: "{proxy+}",
      }),
    );
    const resourceId = resource.id ?? "";
    await client.send(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "ANY",
        authorizationType: "NONE",
      }),
    );
    await client.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "ANY",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: functionArn,
      }),
    );
    const deployment = await client.send(
      new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
    );

    // Then the whole of it reads back through the same client
    const readApi = await client.send(new GetRestApiCommand({ restApiId }));
    assertIdentical(readApi.name, "orders");
    const listedApis = await client.send(new GetRestApisCommand({}));
    expect(listedApis.items?.map((one) => one.id)).toStrictEqual([restApiId]);
    const readResource = await client.send(
      new GetResourceCommand({ restApiId, resourceId, embed: ["methods"] }),
    );
    assertIdentical(readResource.path, "/{proxy+}");
    assertNonNullable(readResource.resourceMethods);
    const listedResources = await client.send(
      new GetResourcesCommand({ restApiId }),
    );
    expect(listedResources.items?.map((one) => one.path)).toStrictEqual([
      "/",
      "/{proxy+}",
    ]);
    const method = await client.send(
      new GetMethodCommand({ restApiId, resourceId, httpMethod: "ANY" }),
    );
    assertIdentical(method.httpMethod, "ANY");
    const integration = await client.send(
      new GetIntegrationCommand({ restApiId, resourceId, httpMethod: "ANY" }),
    );
    assertIdentical(integration.uri, functionArn);
    const stage = await client.send(
      new GetStageCommand({ restApiId, stageName: "prod" }),
    );
    assertIdentical(stage.deploymentId, deployment.id);
    const stages = await client.send(new GetStagesCommand({ restApiId }));
    expect(stages.item?.map((one) => one.stageName)).toStrictEqual(["prod"]);

    // And the changing Commands reach the simulation too
    const updated = await client.send(
      new UpdateRestApiCommand({
        restApiId,
        patchOperations: [{ op: "replace", path: "/name", value: "orders-v2" }],
      }),
    );
    assertIdentical(updated.name, "orders-v2");
    const second = await client.send(
      new CreateDeploymentCommand({ restApiId }),
    );
    await client.send(
      new CreateStageCommand({
        restApiId,
        stageName: "dev",
        deploymentId: second.id,
      }),
    );
    await client.send(new DeleteStageCommand({ restApiId, stageName: "dev" }));
    await client.send(
      new DeleteMethodCommand({ restApiId, resourceId, httpMethod: "ANY" }),
    );
    await client.send(new DeleteResourceCommand({ restApiId, resourceId }));
    await client.send(new DeleteRestApiCommand({ restApiId }));
    const remaining = await client.send(new GetRestApisCommand({}));
    expect(remaining.items).toStrictEqual([]);
  });

  it("advertises every Command name it routes", () => {
    // Given a simulated API Gateway
    const simAws = new SimAws();

    // When its router is asked what it handles, which is what interception
    // reads to decide whether a Command reaches the simulation
    const supported = simAws.apiGateway().sdkCommandRouter();

    // Then every advertised name has a route behind it
    const names = supported.supportedCommandNames();
    expect(names).toContain("CreateRestApiCommand");
    expect(
      names.filter((name) => supported.route(name) === undefined),
    ).toStrictEqual([]);
  });

  it("keeps REST APIs apart from the HTTP APIs of the same scope", async () => {
    // Given an API Gateway client intercepted into one Account and Region
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    const client = new APIGatewayClient({ region: "eu-west-2" });
    simSdk.intercept(client);
    const scope = simAws.account().region("eu-west-2");

    // When a REST API is created
    const created = await client.send(
      new CreateRestApiCommand({ name: "orders" }),
    );

    // Then the REST API is in that scope, and the v2 service in the same scope
    // knows nothing of it, since HTTP APIs are a separate service with state
    // of its own
    assertNonNullable(scope.apiGateway().findRestApi(created.id ?? ""));
    expect(scope.apiGatewayV2().findApi(created.id ?? "")).toBeUndefined();
  });
});
