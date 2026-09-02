import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { samApiAuthResources } from "../../api/auth/sim-cfn-sam-api-auth.js";
import type { SamApiAuth } from "../../api/auth/sim-cfn-sam-api-auth.types.js";

/**
 * The logical ID SAM gives the API that every `HttpApi` event naming no
 * `ApiId` shares. It is the name a template reaches the implicit API by, in an
 * `Output` or in a `Ref` from a Resource of its own.
 */
export const samImplicitHttpApiLogicalId = "ServerlessHttpApi";

/**
 * The logical ID SAM gives the implicit API's stage.
 */
const implicitStageLogicalId = `${samImplicitHttpApiLogicalId}ApiGatewayDefaultStage`;

/**
 * The API and stage an `HttpApi` event naming no `ApiId` is served by.
 *
 * The API is named after the stack, which is the name SAM gives it, and the
 * stage is `$default`: an HTTP API's default stage serves its routes at the
 * root of the endpoint, so a path the event stated is the path a request asks
 * for.
 *
 * Every event naming no `ApiId` produces this same pair, and they are keyed by
 * logical ID, so the API is created once however many events share it.
 *
 * The `Auth` it takes is the one `Globals.HttpApi` states, which is where SAM
 * says an implicit API's authorizers come from. Nothing else of that section
 * reaches this API.
 */
export function samImplicitHttpApiResources(
  auth: SamApiAuth | undefined,
): Record<string, SimCfnTemplateValue> {
  return {
    [samImplicitHttpApiLogicalId]: {
      Type: "AWS::ApiGatewayV2::Api",
      Properties: {
        Name: { Ref: "AWS::StackName" },
        ProtocolType: "HTTP",
      },
    },
    [implicitStageLogicalId]: {
      Type: "AWS::ApiGatewayV2::Stage",
      Properties: {
        ApiId: { Ref: samImplicitHttpApiLogicalId },
        StageName: "$default",
        AutoDeploy: true,
      },
    },
    ...(auth !== undefined && samApiAuthResources(auth)),
  };
}
