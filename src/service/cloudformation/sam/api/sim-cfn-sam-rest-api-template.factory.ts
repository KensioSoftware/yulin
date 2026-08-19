import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { samFunctionType } from "../function/sim-cfn-sam-function.js";
import { samTransformName } from "../sim-cfn-sam-transform.js";
import { samRestApiType } from "./sim-cfn-sam-rest-api.js";

/**
 * What a test asks for when it wants a SAM template holding one REST API in
 * front of one function.
 */
export interface SimCfnSamRestApiTemplateInput {
  /**
   * What this test is about, added to the properties of an API that already
   * deploys.
   */
  readonly apiProperties: SimCfnTemplateValueRecord;
  /**
   * The path the function's `Api` event puts a method on. A test about the API
   * rather than about what it serves asks for none.
   */
  readonly path: string | undefined;
  /**
   * The `Globals.Api` defaults the template states.
   */
  readonly globals: SimCfnTemplateValueRecord;
}

/**
 * The logical ID the API carries, and so the name the REST API is expanded
 * under.
 */
export const samRestApiTemplateLogicalId = "Orders";

/**
 * The logical ID the expanded stage carries, for an API taking the stage name
 * the factory states by default.
 */
export const samRestApiTemplateStageLogicalId = "OrdersprodStage";

/**
 * The stage name the factory's API publishes under.
 */
export const samRestApiTemplateStageName = "prod";

/**
 * A handler reporting the method, the resource path and the stage that reached
 * it. A request served through the template says which of the API's methods
 * served it.
 */
const handlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.httpMethod + " " + event.resource
    + " " + event.requestContext.stage,
});
`;

/**
 * Builds a SAM template holding one AWS::Serverless::Api.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "orders-stack",
 *   template: simCfnSamRestApiTemplateFactory.make({
 *     apiProperties: { StageName: "live" },
 *   }),
 * });
 * ```
 *
 * The method is an `Api` event naming the API by `RestApiId`, the way a SAM
 * template puts a function behind an API it declared. A request the template
 * serves is one the SAM logical ID answered for.
 */
export const simCfnSamRestApiTemplateFactory = new MappedFactory<
  SimCfnSamRestApiTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    apiProperties: { StageName: samRestApiTemplateStageName },
    path: "/orders/{orderId}",
    globals: {},
  }),
  (input) => ({
    Transform: samTransformName,
    Globals: { Api: input.globals },
    Resources: {
      [samRestApiTemplateLogicalId]: {
        Type: samRestApiType,
        Properties: { ...input.apiProperties },
      },
      Handler: {
        Type: samFunctionType,
        Properties: {
          FunctionName: "orders",
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          InlineCode: handlerSource,
          ...functionEvents(input),
        },
      },
    },
    Outputs: {
      ApiId: { Value: { Ref: samRestApiTemplateLogicalId } },
      RootResourceId: {
        Value: {
          "Fn::GetAtt": [samRestApiTemplateLogicalId, "RootResourceId"],
        },
      },
    },
  }),
);

/**
 * The `Events` of the function, for a template whose API serves a path.
 */
function functionEvents(
  input: SimCfnSamRestApiTemplateInput,
): SimCfnTemplateValueRecord {
  if (input.path === undefined) {
    return {};
  }

  return {
    Events: {
      Get: {
        Type: "Api",
        Properties: {
          RestApiId: { Ref: samRestApiTemplateLogicalId },
          Path: input.path,
          Method: "GET",
        },
      },
    },
  };
}
