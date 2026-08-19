import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimHttpApiStage } from "../../apigatewayv2/api/stage/sim-http-api-stage.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("SAM Globals HttpApi defaults", () => {
  it("applies the defaults to every API in the template", async () => {
    // Given a SAM template stating defaults and two APIs taking them
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-api-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Globals: {
          HttpApi: { StageVariables: { table: "orders-dev" } },
        },
        Resources: {
          Orders: { Type: "AWS::Serverless::HttpApi" },
          Rates: { Type: "AWS::Serverless::HttpApi" },
        },
      },
    });

    // Then both APIs are serving from a stage carrying them
    for (const logicalId of ["Orders", "Rates"]) {
      const stage = stack.getResource(`${logicalId}ApiGatewayDefaultStage`)
        ?.simResource as SimHttpApiStage;
      assertNonNullable(stage);

      assertIdentical(stage.stageName, "$default");
      assertIdentical(stage.stageVariables["table"], "orders-dev");
    }
  });

  it("prefers what the API states over the default", async () => {
    // Given an API naming a stage of its own over the default one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-api-override-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Globals: { HttpApi: { StageName: "dev" } },
        Resources: {
          Orders: {
            Type: "AWS::Serverless::HttpApi",
            Properties: { StageName: "prod" },
          },
        },
      },
    });

    // Then the API is served from the stage it named
    const stage = stack.getResource("OrdersprodStage")
      ?.simResource as SimHttpApiStage;
    assertNonNullable(stage);

    assertIdentical(stage.stageName, "prod");
  });
});
