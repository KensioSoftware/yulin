import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samRestApiResources } from "../../api/sim-cfn-sam-rest-api.js";

/**
 * The logical ID SAM gives the API that every `Api` event naming no
 * `RestApiId` shares. It is the name a template reaches the implicit API by,
 * in an `Output` or in a `Ref` from a Resource of its own.
 */
export const samImplicitRestApiLogicalId = "ServerlessRestApi";

/**
 * The API, deployment and stage an `Api` event naming no `RestApiId` is served
 * by.
 *
 * The API is expanded as though the template had declared an
 * `AWS::Serverless::Api` stating nothing, which is what SAM's implicit API is.
 * That gives it the `Prod` stage SAM names, and the `Globals.Api` defaults
 * every API takes. SAM titles the document it generates with the stack name,
 * so that is the name this API answers to when `Globals.Api` states none.
 *
 * Every event naming no `RestApiId` produces this same set, and they are keyed
 * by logical ID, so the API is created once however many events share it.
 */
export function samImplicitRestApiResources(
  globals: SimCfnTemplateValueRecord,
): Record<string, SimCfnTemplateValue> {
  return samRestApiResources({
    logicalId: samImplicitRestApiLogicalId,
    resource: {},
    globals,
    defaultName: { Ref: "AWS::StackName" },
  });
}
