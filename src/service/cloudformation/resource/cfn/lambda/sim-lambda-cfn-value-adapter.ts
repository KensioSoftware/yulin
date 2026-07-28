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

  return undefined;
}
