import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../../serve/http/url/sim-aws-local-url.js";
import type { SimHttpApi } from "../../../../apigatewayv2/api/sim-http-api.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";
import { samImplicitHttpApiLogicalId } from "./sim-cfn-sam-implicit-http-api.js";

/**
 * The proxy event a handler behind an HTTP API route is handed, as far as
 * these tests read it.
 */
interface RatesRequest {
  readonly requestContext: { readonly http: { readonly method: string } };
  readonly pathParameters?: Record<string, string>;
}

/**
 * A handler answering with the method it was asked and the path parameter it
 * captured, so a response says which route served it.
 */
function ratesHandler(request: RatesRequest): SimCfnTemplateValueRecord {
  return {
    statusCode: 200,
    body: `${request.requestContext.http.method} rate for ${
      request.pathParameters?.["currency"] ?? "nothing"
    }`,
  };
}

/**
 * Request a path of a deployed API through the in-process HTTP entry point.
 */
async function requestApi(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
  );
}

/**
 * The body a path of a deployed API answers with.
 */
async function requestApiText(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
): Promise<string> {
  const response = await requestApi(simAws, api, path);

  return await response.text();
}

describe("SAM HttpApi event expansion", () => {
  it("serves a request to the event's path through the function", async () => {
    // Given a SAM function with an HttpApi event stating a path and a method
    const simAws = new SimAws();

    // When it is deployed with a handler bound to the function
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: { Path: "/rates/{currency}", Method: "GET" },
            },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then the event made an API the Stack holds under the SAM name for it
    const api = stack.getResource(samImplicitHttpApiLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(api);
    assertArrayEmpty(stack.skippedResources);

    // And a request to the path the event stated reaches the bound handler
    const response = await requestApi(simAws, api, "/rates/GBP");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET rate for GBP");
  });

  it("serves any method where the event states none", async () => {
    // Given an HttpApi event stating a path and no method
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "any-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Any: { Type: "HttpApi", Properties: { Path: "/rates" } },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then a method the event never named is served by the same route
    const api = stack.getResource(samImplicitHttpApiLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(api);

    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${api.apiEndpoint}/rates` }).toString(),
      { method: "DELETE" },
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "DELETE rate for nothing");
  });

  it("shares one implicit API between the events that name none", async () => {
    // Given two SAM functions whose events both name no ApiId
    const simAws = new SimAws();

    // When they are deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shared-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: { Path: "/rates/{currency}", Method: "GET" },
            },
          },
        },
        resources: {
          Fees: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "fees",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode:
                "exports.handler = async () => " +
                "({ statusCode: 200, body: 'fees' });",
              Events: {
                Get: {
                  Type: "HttpApi",
                  Properties: { Path: "/fees", Method: "GET" },
                },
              },
            },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then one API serves both paths, each through its own function
    const api = stack.getResource(samImplicitHttpApiLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(api);
    assertArrayLength(api.routes.list(), 2);

    assertIdentical(
      await requestApiText(simAws, api, "/rates/GBP"),
      "GET rate for GBP",
    );
    assertIdentical(await requestApiText(simAws, api, "/fees"), "fees");
  });

  it("routes to the API an event names by ApiId", async () => {
    // Given a template declaring an API of its own, and an event naming it
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "named-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: {
                ApiId: { Ref: "RatesApi" },
                Path: "/rates/{currency}",
                Method: "GET",
              },
            },
          },
        },
        resources: {
          RatesApi: {
            Type: "AWS::ApiGatewayV2::Api",
            Properties: { Name: "rates-api", ProtocolType: "HTTP" },
          },
          RatesApiStage: {
            Type: "AWS::ApiGatewayV2::Stage",
            Properties: {
              ApiId: { Ref: "RatesApi" },
              StageName: "$default",
              AutoDeploy: true,
            },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then the route went onto the API the event named, and no implicit API
    // was made for it
    assertUndefined(stack.getResource(samImplicitHttpApiLogicalId));

    const api = stack.getResource("RatesApi")?.simResource as SimHttpApi;
    assertNonNullable(api);
    assertIdentical(
      await requestApiText(simAws, api, "/rates/USD"),
      "GET rate for USD",
    );
  });

  it("serves whatever the API has no route for from a $default path", async () => {
    // Given an HttpApi event whose path is the catch-all one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "default-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Fallback: { Type: "HttpApi", Properties: { Path: "$default" } },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then a path the API has no route of its own for reaches the function
    const api = stack.getResource(samImplicitHttpApiLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(api);

    const response = await requestApi(simAws, api, "/anything/at/all");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET rate for nothing");
  });

  it("conditions what the event made the way the function is", async () => {
    // Given a SAM function with an HttpApi event that the template conditions
    // out
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "conditioned-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Parameters: { Stage: { Type: "String" } },
        Conditions: {
          IsProduction: { "Fn::Equals": [{ Ref: "Stage" }, "production"] },
        },
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Condition: "IsProduction",
            Properties: {
              FunctionName: "conditioned-rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'rates';",
              Events: {
                Get: {
                  Type: "HttpApi",
                  Properties: { Path: "/rates", Method: "GET" },
                },
              },
            },
          },
        },
      },
      parameters: { Stage: "test" },
    });

    // Then the route, integration and permission went with the function, and
    // the API the event would have shared has no route on it
    assertUndefined(stack.getResource("RatesGetHttpApiRoute"));
    assertUndefined(stack.getResource("RatesGetHttpApiIntegration"));
    assertUndefined(stack.getResource("RatesGetHttpApiPermission"));

    const api = stack.getResource(samImplicitHttpApiLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(api);
    assertArrayEmpty(api.routes.list());
  });

  it("leaves the function as it is for an event type it does not expand", async () => {
    // Given a SAM function whose only event is one this expansion has no
    // entry for
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "streamed-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Work: {
              Type: "Kinesis",
              Properties: {
                Stream: "arn:aws:kinesis:eu-west-2:111111111111:stream/work",
                StartingPosition: "LATEST",
              },
            },
          },
        },
      }),
    });

    // Then the function deployed with nothing in front of it, rather than the
    // deployment failing over an event nothing reads
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(stack.getResource(samImplicitHttpApiLogicalId));
    assertArrayEmpty(stack.skippedResources);
  });
});
