import {
  CreateApiCommand,
  CreateStageCommand,
  GetStagesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
} from "../../error/sim-api-gateway-v2.error.js";

describe("Sim API Gateway v2 stage commands", () => {
  it("creates the default stage", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When its $default stage is created
    const created = await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
        StageVariables: { catalogue: "v2" },
        Description: "The live stage",
      }),
    );

    // Then it reports the stage API Gateway would have made
    assertIdentical(created.StageName, "$default");
    assertTrue(created.AutoDeploy);
    expect(created.StageVariables).toStrictEqual({ catalogue: "v2" });
    assertIdentical(created.Description, "The live stage");
  });

  it("lists the stages of an API", async () => {
    // Given an API with a stage
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When its stages are listed
    const { Items: items } = await simAws
      .apiGatewayV2()
      .getStages(new GetStagesCommand({ ApiId: apiId }));

    // Then the stage is there, with no stage variables reported for a stage
    // that has none
    expect(items.map((stage) => stage.StageName)).toStrictEqual(["$default"]);
    expect(items[0]?.StageVariables).toBeUndefined();
  });

  it("refuses a second stage of the same name", async () => {
    // Given an API that already has its $default stage
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When the stage is created again
    // Then it conflicts, as it does on real AWS
    await expect(
      simAws.apiGatewayV2().createStage(
        new CreateStageCommand({
          ApiId: apiId,
          StageName: "$default",
          AutoDeploy: true,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2Conflict);
  });

  it("refuses a stage that does not deploy itself", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When a stage is created without AutoDeploy, which on real AWS serves
    // whichever Deployment it is given and nothing until then
    // Then it is refused, because Deployments are not simulated and the stage
    // would serve every request here while serving none on AWS
    await expect(
      simAws
        .apiGatewayV2()
        .createStage(
          new CreateStageCommand({ ApiId: apiId, StageName: "$default" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });
});
