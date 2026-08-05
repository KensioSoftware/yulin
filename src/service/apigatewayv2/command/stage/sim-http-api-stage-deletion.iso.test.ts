import {
  DeleteStageCommand,
  GetStagesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../../api/sim-http-api-lambda-proxy.factory.js";
import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";

function localUrl(apiEndpoint: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

describe("Sim API Gateway v2 DeleteStage", () => {
  it("stops a request addressed to the deleted stage resolving", async () => {
    // Given an API serving one route from two stages
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["GET /pets"],
        stageNames: ["$default", "dev"],
      },
      simAws,
    );

    // When the named stage is deleted
    await simAws
      .apiGatewayV2()
      .deleteStage(
        new DeleteStageCommand({ ApiId: api.apiId, StageName: "dev" }),
      );

    // Then nothing serves a request addressed to it, while the route itself is
    // still served from the stage that is left
    const http = new SimAwsHttp({ simAws });
    const deleted = await http.fetch(localUrl(api.apiEndpoint, "/dev/pets"));
    assertIdentical(deleted.status, 404);
    expect(await deleted.json()).toStrictEqual({ message: "Not Found" });

    const kept = await http.fetch(localUrl(api.apiEndpoint, "/pets"));
    assertIdentical(kept.status, 200);
    const event = (await kept.json()) as SimPayload2Event;
    assertIdentical(event.requestContext.stage, "$default");

    // And the API reports only the stage it still has
    const { Items: stages } = await simAws
      .apiGatewayV2()
      .getStages(new GetStagesCommand({ ApiId: api.apiId }));
    expect(stages.map((stage) => stage.StageName)).toStrictEqual(["$default"]);
  });

  it("frees the stage name the deleted stage held", async () => {
    // Given an API whose default stage is deleted
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );
    await simAws
      .apiGatewayV2()
      .deleteStage(
        new DeleteStageCommand({ ApiId: api.apiId, StageName: "$default" }),
      );

    // When the stage is created again
    const recreated = await simAws.apiGatewayV2().createStage({
      input: { ApiId: api.apiId, StageName: "$default", AutoDeploy: true },
    });

    // Then nothing conflicts with it, and the API serves from it again
    assertIdentical(recreated.StageName, "$default");
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/"),
    );
    assertIdentical(response.status, 200);
  });

  it("refuses a stage name the API does not have", async () => {
    // Given an API with its default stage
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When some other stage name is deleted
    // Then it is reported as not found
    await expect(
      simAws
        .apiGatewayV2()
        .deleteStage(
          new DeleteStageCommand({ ApiId: api.apiId, StageName: "dev" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("requires the stage to delete", async () => {
    // Given an API
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When no stage name is given, which the SDK command type does not allow
    // but a hand-built request can carry
    // Then the command is refused rather than deleting anything
    await expect(
      simAws.apiGatewayV2().deleteStage({ input: { ApiId: api.apiId } }),
    ).rejects.toThrow(/DeleteStage requires StageName/);
  });
});
