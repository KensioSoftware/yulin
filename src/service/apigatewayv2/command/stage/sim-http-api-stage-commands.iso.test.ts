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
  SimApiGatewayV2NotFound,
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

  it("creates a named stage alongside the default one", async () => {
    // Given an API with its default stage
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

    // When a second stage is created under a name
    const created = await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "dev",
        AutoDeploy: true,
      }),
    );

    // Then the API has both, since a named stage is served under its own path
    // segment rather than replacing the default one
    assertIdentical(created.StageName, "dev");
    const { Items: items } = await simAws
      .apiGatewayV2()
      .getStages(new GetStagesCommand({ ApiId: apiId }));
    expect(items.map((stage) => stage.StageName)).toStrictEqual([
      "$default",
      "dev",
    ]);
  });

  it("refuses a stage name that could not appear in a URL", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When a stage is named with something outside the alphanumerics, hyphens
    // and underscores AWS accepts
    // Then it is refused rather than becoming a stage nothing could reach
    await expect(
      simAws.apiGatewayV2().createStage(
        new CreateStageCommand({
          ApiId: apiId,
          StageName: "dev/two",
          AutoDeploy: true,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);

    const tooLong = new CreateStageCommand({
      ApiId: apiId,
      StageName: "d".repeat(129),
      AutoDeploy: true,
    });

    await expect(simAws.apiGatewayV2().createStage(tooLong)).rejects.toThrow(
      /is not a stage name/,
    );
  });

  it("refuses a stage on an API that does not exist", async () => {
    // Given a simulated AWS with no APIs in it
    const simAws = new SimAws();

    // When a stage is created on an API id nothing holds
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().createStage(
        new CreateStageCommand({
          ApiId: "abcdefghij",
          StageName: "dev",
          AutoDeploy: true,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
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
