import { SimLambdaEventSourceMapping } from "../../../../lambda/event-source/sim-lambda-event-source-mapping.js";
import { SimLambdaEventSourceMappingCfn } from "./sim-lambda-event-source-mapping-cfn.js";
import { SimLambdaFunction } from "../../../../lambda/function/sim-lambda-function.js";
import { SimLambdaFunctionUrl } from "../../../../lambda/function/url/sim-lambda-function-url.js";
import { SimLambdaFunctionCfn } from "./sim-lambda-function-cfn.js";
import { SimLambdaFunctionUrlCfn } from "./sim-lambda-function-url-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated Lambda Resource.
 */
export function lambdaValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Lambda::Function" &&
    properties.simResource instanceof SimLambdaFunction
  ) {
    return new SimLambdaFunctionCfn({ lambdaFunction: properties.simResource });
  }

  if (
    properties.type === "AWS::Lambda::Url" &&
    properties.simResource instanceof SimLambdaFunctionUrl
  ) {
    return new SimLambdaFunctionUrlCfn({ functionUrl: properties.simResource });
  }

  if (
    properties.type === "AWS::Lambda::EventSourceMapping" &&
    properties.simResource instanceof SimLambdaEventSourceMapping
  ) {
    return new SimLambdaEventSourceMappingCfn({
      mapping: properties.simResource,
    });
  }

  return undefined;
}
