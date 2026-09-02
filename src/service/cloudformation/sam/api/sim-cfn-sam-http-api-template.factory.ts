import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { samFunctionType } from "../function/sim-cfn-sam-function-type.js";
import { samTransformName } from "../sim-cfn-sam-transform.js";
import { samHttpApiType } from "./sim-cfn-sam-http-api.js";

/**
 * What a test asks for when it wants a SAM template holding one HTTP API in
 * front of one function.
 */
export interface SimCfnSamHttpApiTemplateInput {
  /**
   * What this test is about, added to the properties of an API that already
   * deploys.
   */
  readonly apiProperties: SimCfnTemplateValueRecord;
  /**
   * The route the API routes onto the function, as Resources of its own. A
   * test declaring its routes in a `DefinitionBody` asks for none.
   */
  readonly routeKey: string | undefined;
}

/**
 * The logical ID the API carries, and so the name the HTTP API is expanded
 * under.
 */
export const samHttpApiTemplateLogicalId = "Orders";

/**
 * The logical ID the expanded stage carries, for the API that names no stage.
 */
export const samHttpApiTemplateStageLogicalId = "OrdersApiGatewayDefaultStage";

/**
 * A handler reporting the route and the stage that reached it. A request
 * served through the template says which of the API's routes served it.
 */
const handlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.routeKey + " " + event.requestContext.stage,
});
`;

/**
 * Builds a SAM template holding one AWS::Serverless::HttpApi.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "orders-stack",
 *   template: simCfnSamHttpApiTemplateFactory.make({
 *     apiProperties: { StageName: "prod" },
 *   }),
 * });
 * ```
 *
 * The routes and the integration are Resources naming the API by `ApiId`, the
 * way a template writes them against an API it declared. A request the
 * template serves is one the SAM logical ID answered for.
 */
export const simCfnSamHttpApiTemplateFactory = new MappedFactory<
  SimCfnSamHttpApiTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({ apiProperties: {}, routeKey: "GET /orders" }),
  (input) => ({
    Transform: samTransformName,
    Resources: {
      [samHttpApiTemplateLogicalId]: {
        Type: samHttpApiType,
        Properties: { ...input.apiProperties },
      },
      Handler: {
        Type: samFunctionType,
        Properties: {
          FunctionName: "orders",
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          InlineCode: handlerSource,
        },
      },
      HandlerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Handler", "Arn"] },
          Principal: "apigateway.amazonaws.com",
        },
      },
      ...integrationResources(input),
    },
    Outputs: {
      ApiId: { Value: { Ref: samHttpApiTemplateLogicalId } },
      ApiEndpoint: {
        Value: { "Fn::GetAtt": [samHttpApiTemplateLogicalId, "ApiEndpoint"] },
      },
    },
  }),
);

/**
 * The integration and the route reaching it, for a template that declares its
 * routes as Resources of their own.
 */
function integrationResources(
  input: SimCfnSamHttpApiTemplateInput,
): SimCfnTemplateValueRecord {
  if (input.routeKey === undefined) {
    return {};
  }

  return {
    Integration: {
      Type: "AWS::ApiGatewayV2::Integration",
      Properties: {
        ApiId: { Ref: samHttpApiTemplateLogicalId },
        IntegrationType: "AWS_PROXY",
        IntegrationUri: { "Fn::GetAtt": ["Handler", "Arn"] },
        PayloadFormatVersion: "2.0",
      },
    },
    Route: {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: {
        ApiId: { Ref: samHttpApiTemplateLogicalId },
        RouteKey: input.routeKey,
        AuthorizationType: "NONE",
        Target: { "Fn::Join": ["", ["integrations/", { Ref: "Integration" }]] },
      },
    },
  };
}
