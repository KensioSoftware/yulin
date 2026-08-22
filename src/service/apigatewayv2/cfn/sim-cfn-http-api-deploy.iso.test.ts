import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployHttpApi,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

/**
 * A handler reporting which route served the request, so a test with several
 * routes can tell them apart.
 */
const routeReportingHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.routeKey + " " + JSON.stringify(event.pathParameters ?? {}),
});
`;

function localUrl(endpoint: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `${endpoint}${path}` }).toString();
}

describe("API Gateway v2 CloudFormation deployment", () => {
  it("serves a request through a deployed API, route and integration", async () => {
    // Given a template declaring an API, a stage, an integration and a route
    // in front of a Lambda function
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        routeKeys: ["GET /orders/{orderId}"],
      }),
    );

    // When the deployed endpoint is requested
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint, "/orders/YL-1"),
    );

    // Then the request reached the integration's function through the route
    assertIdentical(response.status, 200);
    assertIdentical(
      await response.text(),
      'GET /orders/{orderId} {"orderId":"YL-1"}',
    );
  });

  it("resolves the endpoint CDK builds from AWS::URLSuffix to the same API", async () => {
    // Given a template whose output is the URL CDK's `httpApi.url` resolves
    // to, which joins AWS::URLSuffix rather than reading ApiEndpoint
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        routeKeys: ["GET /orders"],
        outputs: {
          CdkApiUrl: {
            Value: {
              "Fn::Join": [
                "",
                [
                  "https://",
                  { Ref: "Api" },
                  ".execute-api.eu-west-2.",
                  { Ref: "AWS::URLSuffix" },
                  "/",
                ],
              ],
            },
          },
        },
      }),
    );

    // When both endpoint forms are requested
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    const cdkApiUrl = stack.outputs.get("CdkApiUrl")?.value;
    assertTypeString(apiEndpoint);
    assertTypeString(cdkApiUrl);
    const http = new SimAwsHttp({ simAws });
    const fromApiEndpoint = await http.fetch(localUrl(apiEndpoint, "/orders"));
    const fromCdkUrl = await http.fetch(localUrl(cdkApiUrl, "orders"));

    // Then the amazonaws.com form and the local suffix form reach one API
    assertIdentical(fromApiEndpoint.status, 200);
    assertIdentical(fromCdkUrl.status, 200);
    assertIdentical(await fromApiEndpoint.text(), await fromCdkUrl.text());
  });

  it("routes several routes through one integration", async () => {
    // Given a template with three routes all targeting the one integration
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        routeKeys: ["GET /orders", "POST /orders", "GET /orders/{orderId}"],
      }),
    );
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const http = new SimAwsHttp({ simAws });

    // When each is requested, including the one the stage was created before
    const list = await http.fetch(localUrl(apiEndpoint, "/orders"));
    const create = await http.fetch(localUrl(apiEndpoint, "/orders"), {
      method: "POST",
    });
    const read = await http.fetch(localUrl(apiEndpoint, "/orders/YL-1"));

    // Then each reaches the function through the route that matched it
    assertIdentical(await list.text(), "GET /orders {}");
    assertIdentical(await create.text(), "POST /orders {}");
    assertIdentical(
      await read.text(),
      'GET /orders/{orderId} {"orderId":"YL-1"}',
    );
  });

  it("refuses the generated endpoint when the API disables it", async () => {
    // Given an API deployed with the generated endpoint turned off
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        apiProperties: { DisableExecuteApiEndpoint: true },
      }),
    );

    // When the generated endpoint is requested
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint, "/orders"),
    );

    // Then it is refused rather than served
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
  });

  it("carries the stage variables the template gave the stage", async () => {
    // Given a stage declaring variables
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        stageProperties: {
          StageVariables: { catalogue: "v2" },
          Description: "the default stage",
        },
      }),
    );

    // When the deployed stage is read back
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    const stage = simAws.apiGatewayV2().findApi(apiId)?.stages.find("$default");

    // Then it holds them, as a stage created by an SDK caller would
    assertNonNullable(stage);
    expect(stage.stageVariables).toStrictEqual({ catalogue: "v2" });
    assertIdentical(stage.description, "the default stage");
  });

  it("accepts the API Gateway path form of an integration URI", async () => {
    // Given an integration URI written as the API Gateway Lambda invoke path
    // rather than as the bare function ARN CDK emits
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        routeKeys: ["GET /orders"],
        integrationProperties: {
          IntegrationUri: {
            "Fn::Join": [
              "",
              [
                "arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/",
                { "Fn::GetAtt": ["Handler", "Arn"] },
                "/invocations",
              ],
            ],
          },
        },
      }),
    );

    // When the deployed endpoint is requested
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint, "/orders"),
    );

    // Then it reached the same function
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "GET /orders {}");
  });

  it("throttles a deployed stage's route at the limits it declares", async () => {
    // Given a template whose stage throttles one route harder than the rest
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        routeKeys: ["GET /orders", "POST /orders"],
        stageProperties: {
          DefaultRouteSettings: {
            ThrottlingRateLimit: 10,
            ThrottlingBurstLimit: 5,
          },
          RouteSettings: {
            "POST /orders": {
              ThrottlingRateLimit: 1,
              ThrottlingBurstLimit: 1,
            },
          },
        },
      }),
    );

    // When the throttled route is used twice over
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    simAws.clock().freeze();
    const http = new SimAwsHttp({ simAws });
    const served = await http.fetch(localUrl(apiEndpoint, "/orders"), {
      method: "POST",
    });
    const refused = await http.fetch(localUrl(apiEndpoint, "/orders"), {
      method: "POST",
    });

    // Then the deployed limits are the ones the stage serves at, and the route
    // on the stage default is untouched by the other route's burst
    assertIdentical(served.status, 200);
    assertIdentical(refused.status, 429);

    const other = await http.fetch(localUrl(apiEndpoint, "/orders"));
    assertIdentical(other.status, 200);
  });
});
