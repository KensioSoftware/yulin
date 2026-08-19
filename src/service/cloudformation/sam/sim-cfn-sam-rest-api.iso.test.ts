import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimRestApi } from "../../apigateway/api/sim-rest-api.js";
import type { SimRestApiStage } from "../../apigateway/api/stage/sim-rest-api-stage.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import {
  samRestApiTemplateLogicalId,
  samRestApiTemplateStageLogicalId,
  samRestApiTemplateStageName,
  simCfnSamRestApiTemplateFactory,
} from "./api/sim-cfn-sam-rest-api-template.factory.js";

/**
 * Deploy a SAM template and wait for the API it holds to be serving.
 */
async function deployRestApi(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<SimCfnStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "orders-stack", template });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * The API the stack deployed under the SAM logical ID.
 */
function deployedApi(stack: SimCfnStack): SimRestApi {
  const api = stack.getResource(samRestApiTemplateLogicalId)
    ?.simResource as SimRestApi;
  assertNonNullable(api);

  return api;
}

/**
 * Request a path of the API the stack deployed, through one of its stages.
 */
async function requestApi(
  simAws: SimAws,
  stack: SimCfnStack,
  path: string,
  stageName = samRestApiTemplateStageName,
): Promise<Response> {
  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${deployedApi(stack).invokeUrl(stageName)}${path}`,
    }).toString(),
  );
}

describe("SAM Serverless Api expansion", () => {
  it("deploys a SAM REST API as an API, a deployment and a stage", async () => {
    // Given a SAM template declaring one REST API in front of a function
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make(),
    );

    // Then the SAM logical ID is a simulated REST API, with a deployment and a
    // stage of its own
    assertIdentical(
      stack.getResource(samRestApiTemplateLogicalId)?.type,
      "AWS::ApiGateway::RestApi",
    );
    assertIdentical(
      stack.getResource("OrdersDeployment")?.type,
      "AWS::ApiGateway::Deployment",
    );
    assertIdentical(
      stack.getResource(samRestApiTemplateStageLogicalId)?.type,
      "AWS::ApiGateway::Stage",
    );
    assertArrayLength(stack.skippedResources, 0);

    // And the method the event declared against it is served from that stage
    const response = await requestApi(simAws, stack, "/orders/YL-1");

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "GET /orders/{orderId} prod");
  });

  it("names an API that names itself none after its logical ID", async () => {
    // Given an API stating no Name, which a REST API cannot go without
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make(),
    );

    // Then the logical ID the template already had for it named it
    assertIdentical(deployedApi(stack).name, samRestApiTemplateLogicalId);
  });

  it("answers Ref and Fn::GetAtt against the SAM logical ID", async () => {
    // Given a SAM template outputting what its API's logical ID resolves to
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make(),
    );

    // Then both answer for the API the SAM Resource was expanded into
    const api = deployedApi(stack);

    assertIdentical(stack.outputs.get("ApiId")?.value, api.apiId);
    assertIdentical(
      stack.outputs.get("RootResourceId")?.value,
      api.rootResource.resourceId,
    );
  });

  it("deploys the stage the API names, with the variables it states", async () => {
    // Given an API naming a stage and the variables it serves under
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        apiProperties: {
          StageName: "live",
          Variables: { table: "orders-live" },
        },
      }),
    );

    // Then the stage carries the name and the variables the API stated
    const stage = stack.getResource("OrdersliveStage")
      ?.simResource as SimRestApiStage;
    assertNonNullable(stage);
    assertIdentical(stage.stageName, "live");
    assertObjectEquals(stage.variables, { table: "orders-live" });

    // And it serves the API's methods under its own path segment
    const response = await requestApi(simAws, stack, "/orders/YL-1", "live");

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "GET /orders/{orderId} live");
  });

  it("names the stage of an API whose stage name is no identifier", async () => {
    // Given an API naming a stage a logical ID cannot be built out of, which
    // SAM hashes into one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        apiProperties: { StageName: "orders-dev" },
      }),
    );

    // Then the stage carries the logical ID SAM hashes the name into, and
    // serves the API's methods
    const stage = stack.getResource("OrdersStageaed0986a76")
      ?.simResource as SimRestApiStage;
    assertNonNullable(stage);
    assertIdentical(stage.stageName, "orders-dev");

    const response = await requestApi(
      simAws,
      stack,
      "/orders/YL-1",
      "orders-dev",
    );

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "GET /orders/{orderId} orders-dev");
  });

  it("publishes the stage SAM names where the API names none", async () => {
    // Given an API leaving out the StageName SAM requires of one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(simAws, {
      Transform: "AWS::Serverless-2016-10-31",
      Resources: {
        [samRestApiTemplateLogicalId]: { Type: "AWS::Serverless::Api" },
      },
    });

    // Then it deploys under the stage SAM gives the implicit API, rather than
    // failing the stack over a property a hand-written template forgot
    const stage = stack.getResource("OrdersProdStage")
      ?.simResource as SimRestApiStage;
    assertNonNullable(stage);
    assertIdentical(stage.stageName, "Prod");
  });

  it("records a Swagger DefinitionBody the API was created without", async () => {
    // Given an API declaring its methods as a Swagger 2.0 document, which is
    // the specification this reads nothing from
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        path: undefined,
        apiProperties: {
          DefinitionBody: {
            swagger: "2.0",
            info: { title: "orders-api", version: "1.0" },
            paths: {},
          },
        },
      }),
    );

    // Then the API deploys with an empty tree, and the record says the
    // document is what it was created without
    assertArrayLength(deployedApi(stack).resources.list(), 1);
    assertTrue(
      stack.ignoredProperties.some(
        (ignored) =>
          ignored.logicalId === samRestApiTemplateLogicalId &&
          ignored.reason.includes("Body"),
      ),
    );
  });

  it("imports an OpenAPI 3 DefinitionBody into the API's path tree", async () => {
    // Given an API declaring its one method as an OpenAPI 3.0 document, which
    // is what SAM writes for OpenApiVersion 3.0.1
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        path: undefined,
        apiProperties: {
          DefinitionBody: {
            openapi: "3.0.1",
            info: { title: "orders-api", version: "1.0" },
            paths: {
              "/orders": {
                get: {
                  "x-amazon-apigateway-integration": {
                    type: "aws_proxy",
                    httpMethod: "POST",
                    uri: { "Fn::GetAtt": ["Handler", "Arn"] },
                  },
                },
              },
            },
          },
        },
      }),
    );

    // Then the document built the path tree and the method on it. SAM writes
    // no invoke permission for a method only the document declares, so the
    // function's own AWS::Lambda::Permission is what makes it serve.
    const api = deployedApi(stack);
    assertObjectEquals(
      api.resources.list().map((resource) => resource.path),
      ["/", "/orders"],
    );
    assertNonNullable(api.resources.findByPath("/orders")?.findMethod("GET"));
  });

  it("records an API declaring a DefinitionUri as unsupported", async () => {
    // Given an API whose document is a file this reads nothing from
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        path: undefined,
        apiProperties: { DefinitionUri: "swagger/orders.yaml" },
      }),
    );

    // Then the API is recorded the way any Resource type nothing models is,
    // rather than deployed as an API serving nothing
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertIdentical(skipped.logicalId, samRestApiTemplateLogicalId);
    assertIdentical(
      skipped.skippedReason,
      "Unsupported sim CloudFormation Resource service Serverless",
    );
  });

  it("leaves out the deployment and stage of an API conditioned out", async () => {
    // Given an API the template only deploys under a condition it fails
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(simAws, {
      Transform: "AWS::Serverless-2016-10-31",
      Conditions: { IsProduction: { "Fn::Equals": ["dev", "prod"] } },
      Resources: {
        [samRestApiTemplateLogicalId]: {
          Type: "AWS::Serverless::Api",
          Condition: "IsProduction",
          Properties: { StageName: "prod" },
        },
      },
    });

    // Then none of the three Resources it expands into was created
    assertUndefined(stack.getResource(samRestApiTemplateLogicalId));
    assertUndefined(stack.getResource("OrdersDeployment"));
    assertUndefined(stack.getResource(samRestApiTemplateStageLogicalId));
  });

  it("takes the Globals.Api defaults, and lets the API overrule them", async () => {
    // Given a template stating defaults for every API, and an API stating one
    // of them for itself
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnSamRestApiTemplateFactory.make({
        globals: { Name: "every-api", Variables: { table: "orders" } },
        apiProperties: { Name: "orders-api" },
      }),
    );

    // Then the default the API said nothing about reached it, and the one it
    // stated for itself won
    assertIdentical(deployedApi(stack).name, "orders-api");

    const stage = stack.getResource(samRestApiTemplateStageLogicalId)
      ?.simResource as SimRestApiStage;
    assertNonNullable(stage);
    assertObjectEquals(stage.variables, { table: "orders" });
  });
});
