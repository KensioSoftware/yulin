import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployHttpApi,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

const logGroupName = "orders-access";

/** A log group declared alongside the API, as a CDK app declares one. */
const logGroupResource = {
  AccessLogGroup: {
    Type: "AWS::Logs::LogGroup",
    Properties: { LogGroupName: logGroupName },
  },
};

/**
 * `Fn::GetAtt` on a log group's `Arn`, which is the form CDK emits and which
 * ends in the `:*` wildcard.
 */
const destinationArn = { "Fn::GetAtt": ["AccessLogGroup", "Arn"] };

function localUrl(endpoint: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `${endpoint}${path}` }).toString();
}

async function accessLogLines(simAws: SimAws): Promise<readonly string[]> {
  const { events } = await simAws
    .logs()
    .filterLogEvents({ input: { logGroupName } });

  return (events ?? []).map((event) => event.message);
}

describe("Deploying an HTTP API stage's AccessLogSettings", () => {
  it("logs a served request to the log group the template named", async () => {
    // Given a template whose stage writes an access log to a declared group
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        resources: logGroupResource,
        stageProperties: {
          AccessLogSettings: {
            DestinationArn: destinationArn,
            Format: "$context.httpMethod $context.path $context.status",
          },
        },
      }),
    );

    // Then the property deployed rather than being recorded as ignored
    expect(ignoredReasons(stack)).toStrictEqual([]);

    // When a request is served
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    await new SimAwsHttp({ simAws }).fetch(localUrl(apiEndpoint, "/orders"));

    // Then the line is in the group the template named
    expect(await accessLogLines(simAws)).toStrictEqual(["GET /orders 200"]);
  });

  it("reports the settings the stage was deployed with", async () => {
    // Given the same template
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: logGroupResource,
        stageProperties: {
          AccessLogSettings: {
            DestinationArn: destinationArn,
            Format: "$context.requestId",
          },
        },
      }),
    );

    // When the stages are read back off the deployment
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const { Items: stages } = await simAws
      .apiGatewayV2()
      .getStages({ input: { ApiId: apiId } });

    // Then GetStages reports what the template asked for
    const [stage] = stages;
    assertNonNullable(stage);
    const settings = stage.AccessLogSettings;
    assertNonNullable(settings);
    assertIdentical(settings.Format, "$context.requestId");
    expect(settings.DestinationArn).toMatch(
      /^arn:aws:logs:eu-west-2:\d{12}:log-group:orders-access:\*$/,
    );
  });
});
