import { SimSsmParameter } from "../../../../ssm/parameter/sim-ssm-parameter.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimSsmParameterCfn } from "./sim-ssm-parameter-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated SSM Resource.
 */
export function ssmValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::SSM::Parameter" &&
    properties.simResource instanceof SimSsmParameter
  ) {
    return new SimSsmParameterCfn({ parameter: properties.simResource });
  }

  return undefined;
}
