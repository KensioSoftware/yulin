import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  deployRestApiFailure,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { simCfnRestApiMethodLogicalId } from "./sim-cfn-rest-api-template-ids.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * The logical ID of the one method the default template carries, which a
 * message about a malformed property names.
 */
const methodLogicalId = simCfnRestApiMethodLogicalId({
  httpMethod: "GET",
  path: ["orders"],
});

describe("API Gateway REST API CloudFormation property shapes", () => {
  it("refuses a property that has to be a string and is not", async () => {
    // Given an API whose description is a number
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        apiProperties: { Description: 42 },
      }),
    );

    // Then the stack fails saying what the property has to be
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGateway::RestApi Api: Description must be a string",
    );
  });

  it("refuses a required property the template left out", async () => {
    // Given an API with no name, which CreateRestApi cannot work without
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        apiProperties: { Name: undefined },
      }),
    );

    // Then the stack fails naming the property it needed
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGateway::RestApi Api: Name must be a string",
    );
  });

  it("refuses a method whose Integration is not an object", async () => {
    // Given a method whose integration block is a string
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methodProperties: { Integration: "AWS_PROXY" },
      }),
    );

    // Then the stack fails saying what the block has to be
    assertStringIncludes(
      error.message,
      `Invalid AWS::ApiGateway::Method ${methodLogicalId}: ` +
        `Integration must be an object`,
    );
  });

  it("refuses an integration with no URI", async () => {
    // Given an integration naming no function
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        integrationProperties: { Uri: undefined },
      }),
    );

    // Then PutIntegration refuses it, since an AWS_PROXY integration with
    // nothing to proxy to would match requests and hand them nowhere
    assertStringIncludes(error.message, "PutIntegration requires uri");
  });

  it("reads a boolean written as a template string", async () => {
    // Given an API turning its generated endpoint off with the string
    // CloudFormation carries booleans as in places
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        apiProperties: { DisableExecuteApiEndpoint: "true" },
      }),
    );

    // Then it was read as the boolean it stands for
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertTrue(
      simAws.apiGateway().findRestApi(apiId)?.disableExecuteApiEndpoint,
    );
  });

  it("refuses stage variables that are not strings", async () => {
    // Given a stage whose variable holds a number
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        stageProperties: { Variables: { catalogue: 2 } },
      }),
    );

    // Then the stack fails naming the entry
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGateway::Stage Stage: Variables.catalogue must be a string",
    );
  });
});

describe("API Gateway REST API CloudFormation properties left out", () => {
  it("records the OpenAPI Body an API is declared with", async () => {
    // Given an API declaring its resources and methods as a document
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        apiProperties: { Body: { openapi: "3.0.1" }, FailOnWarnings: true },
      }),
    );

    // Then the API is created and the document is reported, since nothing here
    // reads one and the API has only what its sibling Resources declared
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertNonNullable(simAws.apiGateway().findRestApi(apiId));
    expect(ignoredReasons(stack)).toStrictEqual([
      "Api AWS::ApiGateway::RestApi property Body is not simulated, so the " +
        "Resource is created without it and behaves differently here than on " +
        "AWS. The simulated properties are Name, Description, " +
        "DisableExecuteApiEndpoint.",
      "Api AWS::ApiGateway::RestApi property FailOnWarnings is not simulated, " +
        "so the Resource is created without it and behaves differently here " +
        "than on AWS. The simulated properties are Name, Description, " +
        "DisableExecuteApiEndpoint.",
    ]);
  });

  it("records an unsimulated property of a method and of its integration apart", async () => {
    // Given a method declaring request parameters and an integration
    // declaring a request template
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methodProperties: {
          RequestParameters: { "method.request.querystring.page": false },
        },
        integrationProperties: {
          RequestTemplates: { "application/json": "{}" },
        },
      }),
    );

    // Then each is recorded under the block it was declared in
    const ignored = stack.ignoredProperties.map((entry) => entry.path);
    expect(ignored).toStrictEqual([
      "RequestParameters",
      "Integration.RequestTemplates",
    ]);
    const [, integrationProperty] = stack.ignoredProperties;
    assertNonNullable(integrationProperty);
    assertIdentical(
      integrationProperty.resourceType,
      "AWS::ApiGateway::Method",
    );
    assertStringIncludes(
      integrationProperty.reason,
      "AWS::ApiGateway::Method Integration property RequestTemplates is not simulated",
    );
  });

  it("records the settings a stage was created without", async () => {
    // Given a stage asking for throttling and access logs
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        stageProperties: {
          MethodSettings: [{ HttpMethod: "*", ThrottlingBurstLimit: 10 }],
          TracingEnabled: true,
        },
      }),
    );

    // Then the stage serves the API and both are reported, since a stage that
    // looked throttled to the template and was not is the failure to avoid
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertNonNullable(
      simAws.apiGateway().findRestApi(apiId)?.stages.find("prod"),
    );
    expect(stack.ignoredProperties.map((entry) => entry.path)).toStrictEqual([
      "MethodSettings",
      "TracingEnabled",
    ]);
  });
});

describe("API Gateway REST API CloudFormation template logical IDs", () => {
  it("gives two paths that differ only in punctuation their own Resources", async () => {
    // Given methods on a literal `proxy` node, a `{proxy}` parameter and a
    // greedy `{proxy+}`, which spell one path part three ways
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [
          { httpMethod: "GET", path: ["orders", "proxy"] },
          { httpMethod: "GET", path: ["orders", "{proxy}"] },
          { httpMethod: "GET", path: ["{proxy+}"] },
        ],
      }),
    );

    // Then each is its own node of the tree, rather than one node three
    // Resources overwrote in turn
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const { resources } = simAws.apiGateway().findRestApi(apiId) ?? {};
    assertNonNullable(resources);
    const paths = resources.list().map((resource) => resource.path);
    expect(new Set(paths)).toStrictEqual(
      new Set([
        "/",
        "/orders",
        "/orders/proxy",
        "/orders/{proxy}",
        "/{proxy+}",
      ]),
    );
  });
});
