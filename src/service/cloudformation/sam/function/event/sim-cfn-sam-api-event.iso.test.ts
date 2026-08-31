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
import type { SimRestApi } from "../../../../apigateway/api/sim-rest-api.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";
import { samImplicitRestApiLogicalId } from "./sim-cfn-sam-implicit-rest-api.js";

/** The stage the implicit API publishes under, which is the one SAM names. */
const implicitStageName = "Prod";

/**
 * The proxy event a handler behind a REST API method is handed, as far as
 * these tests read it.
 */
interface RatesRequest {
  readonly httpMethod: string;
  readonly pathParameters?: Record<string, string> | null;
}

/**
 * A handler answering with the method it was asked and the path parameter it
 * captured, so a response says which method served it.
 */
function ratesHandler(request: RatesRequest): SimCfnTemplateValueRecord {
  return {
    statusCode: 200,
    body: `${request.httpMethod} rate for ${
      request.pathParameters?.["currency"] ?? "nothing"
    }`,
  };
}

/** The implicit API the stack deployed, under the logical ID SAM gives it. */
function implicitApi(stack: SimCfnDeployedStack): SimRestApi {
  const api = stack.getResource(samImplicitRestApiLogicalId)
    ?.simResource as SimRestApi;
  assertNonNullable(api);

  return api;
}

/**
 * Request a path of a deployed API through the in-process HTTP entry point.
 */
async function requestApi(
  simAws: SimAws,
  api: SimRestApi,
  path: string,
  options: { readonly method?: string; readonly stageName?: string } = {},
): Promise<Response> {
  const { method = "GET", stageName = implicitStageName } = options;

  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${api.invokeUrl(stageName)}${path}`,
    }).toString(),
    { method },
  );
}

describe("SAM Api event expansion", () => {
  it("serves a request to the event's path through the function", async () => {
    // Given a SAM function with an Api event stating a path and a method
    const simAws = new SimAws();

    // When it is deployed with a handler bound to the function
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "Api",
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
    const api = implicitApi(stack);
    assertArrayEmpty(stack.skippedResources);

    // And a request to the path the event stated reaches the bound handler
    const response = await requestApi(simAws, api, "/rates/GBP");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET rate for GBP");
  });

  it("serves any method where the event asks for one", async () => {
    // Given an Api event whose method is the `any` a SAM template writes
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "any-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Any: { Type: "Api", Properties: { Path: "/rates", Method: "any" } },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then a method the event never named is served by the same method
    const response = await requestApi(simAws, implicitApi(stack), "/rates", {
      method: "DELETE",
    });

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "DELETE rate for nothing");
  });

  it("shares one implicit API between the events that name none", async () => {
    // Given two SAM functions whose events both name no RestApiId, on paths
    // that share the segment above them
    const simAws = new SimAws();

    // When they are deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shared-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "Api",
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
                  Type: "Api",
                  Properties: { Path: "/rates/fees", Method: "GET" },
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

    // Then one API serves both paths, off one node spelling the segment they
    // share
    const api = implicitApi(stack);
    assertArrayLength(api.resources.list(), 4);

    const response = await requestApi(simAws, api, "/rates/GBP");
    assertIdentical(await response.text(), "GET rate for GBP");

    const shared = await requestApi(simAws, api, "/rates/fees");
    assertIdentical(await shared.text(), "fees");
  });

  it("puts a method on the root where the event's path is one", async () => {
    // Given an Api event whose path is the root of the API
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "root-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: { Type: "Api", Properties: { Path: "/", Method: "GET" } },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then the method went on the API's root resource, with no node under it
    const api = implicitApi(stack);
    assertArrayLength(api.resources.list(), 1);

    const response = await requestApi(simAws, api, "/");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET rate for nothing");
  });

  it("routes to the API an event names by RestApiId", async () => {
    // Given a template declaring a REST API of its own, and an event naming it
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "named-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "Api",
              Properties: {
                RestApiId: { Ref: "RatesApi" },
                Path: "/rates/{currency}",
                Method: "GET",
              },
            },
          },
        },
        resources: {
          RatesApi: {
            Type: "AWS::ApiGateway::RestApi",
            Properties: { Name: "rates-api" },
          },
          RatesApiDeployment: {
            Type: "AWS::ApiGateway::Deployment",
            Properties: { RestApiId: { Ref: "RatesApi" } },
          },
          RatesApiStage: {
            Type: "AWS::ApiGateway::Stage",
            Properties: {
              RestApiId: { Ref: "RatesApi" },
              DeploymentId: { Ref: "RatesApiDeployment" },
              StageName: "live",
            },
          },
        },
      }),
      bindings: [
        { logicalId: samFunctionTemplateLogicalId, handler: ratesHandler },
      ],
    });

    // Then the method went onto the API the event named, and no implicit API
    // was made for it
    assertUndefined(stack.getResource(samImplicitRestApiLogicalId));

    const api = stack.getResource("RatesApi")?.simResource as SimRestApi;
    assertNonNullable(api);

    const response = await requestApi(simAws, api, "/rates/USD", {
      stageName: "live",
    });

    assertIdentical(await response.text(), "GET rate for USD");
  });

  it("takes the Globals.Api defaults for the implicit API", async () => {
    // Given a template stating defaults for every API, and a function whose
    // event makes the implicit one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        apiGlobals: { Name: "rates-api" },
        functionProperties: {
          Events: {
            Get: { Type: "Api", Properties: { Path: "/rates", Method: "GET" } },
          },
        },
      }),
    });

    // Then the API the event made was named by them, where it would otherwise
    // have taken the name of the stack
    assertIdentical(implicitApi(stack).name, "rates-api");
  });

  it("conditions what the event made the way the function is", async () => {
    // Given a SAM function with an Api event that the template conditions out
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
                  Type: "Api",
                  Properties: { Path: "/rates", Method: "GET" },
                },
              },
            },
          },
        },
      },
      parameters: { Stage: "test" },
    });

    // Then the method and the permission went with the function, and the API
    // the event would have shared has nothing to answer with
    assertUndefined(stack.getResource("RatesGetMethod"));
    assertUndefined(stack.getResource("RatesGetPermission"));

    const response = await requestApi(simAws, implicitApi(stack), "/rates");

    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("leaves the function alone for an event naming an API by nothing", async () => {
    // Given an Api event whose RestApiId is neither a logical ID nor a Ref to
    // one, so nothing here can reach the root the path tree hangs off
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "imported-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Get: {
              Type: "Api",
              Properties: {
                RestApiId: { "Fn::ImportValue": "shared-api-id" },
                Path: "/rates",
                Method: "GET",
              },
            },
          },
        },
      }),
    });

    // Then the function deployed with nothing in front of it, rather than the
    // deployment failing over an API this cannot build a tree on
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(stack.getResource(samImplicitRestApiLogicalId));
    assertUndefined(stack.getResource("RatesGetMethod"));
    assertArrayEmpty(stack.skippedResources);
  });

  it("leaves the function alone for an event stating no path", async () => {
    // Given an Api event with no Path, and so no node for a method to hang off
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "pathless-rates-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: { Get: { Type: "Api", Properties: { Method: "GET" } } },
        },
      }),
    });

    // Then the function deployed with nothing in front of it
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(stack.getResource(samImplicitRestApiLogicalId));
    assertArrayEmpty(stack.skippedResources);
  });
});
