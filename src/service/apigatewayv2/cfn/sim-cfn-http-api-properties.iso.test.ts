import {
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  deployHttpApiFailure,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

describe("API Gateway v2 CloudFormation property shapes", () => {
  it("refuses a property that has to be a string and is not", async () => {
    // Given an API whose description is a number
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: { Description: 42 },
      }),
    );

    // Then the stack fails saying what the property has to be
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGatewayV2::Api Api: Description must be a string",
    );
  });

  it("refuses a required property the template left out", async () => {
    // Given an API with no name, which CreateApi cannot work without
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: { Name: undefined },
      }),
    );

    // Then the stack fails naming the property it needed
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGatewayV2::Api Api: Name must be a string",
    );
  });

  it("refuses an integration with no URI", async () => {
    // Given an integration naming no function
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        integrationProperties: { IntegrationUri: undefined },
      }),
    );

    // Then CreateIntegration refuses it, since an AWS_PROXY integration with
    // nothing to proxy to would match requests and hand them nowhere
    assertStringIncludes(
      error.message,
      "CreateIntegration requires IntegrationUri",
    );
  });

  it("reads a boolean written as a template string", async () => {
    // Given an API turning its generated endpoint off with the string
    // CloudFormation carries booleans as in places
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        apiProperties: { DisableExecuteApiEndpoint: "true" },
        stageProperties: { AutoDeploy: "true" },
      }),
    );

    // Then the deployed API reads it as a boolean, as CloudFormation does
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertTrue(
      simAws.apiGatewayV2().findApi(apiId)?.disableExecuteApiEndpoint ?? false,
    );
  });

  it("refuses a property that has to be a boolean and is not", async () => {
    // Given a stage whose AutoDeploy is neither a boolean nor one of the
    // strings CloudFormation carries a boolean as
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        stageProperties: { AutoDeploy: "yes" },
      }),
    );

    // Then the stack fails saying what the property has to be
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGatewayV2::Stage Stage: AutoDeploy must be a boolean",
    );
  });
});
