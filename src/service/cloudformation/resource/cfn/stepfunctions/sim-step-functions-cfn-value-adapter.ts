import { SimStateMachine } from "../../../../stepfunctions/machine/sim-state-machine.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimStateMachineCfn } from "./sim-state-machine-cfn.js";
import { stateMachineResourceType } from "./sim-cfn-step-functions-resource-types.js";

/**
 * The CloudFormation-facing value adapter for a simulated Step Functions
 * Resource.
 */
export function stepFunctionsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type, simResource } = properties;

  if (
    type === stateMachineResourceType &&
    simResource instanceof SimStateMachine
  ) {
    return new SimStateMachineCfn(simResource);
  }

  return undefined;
}
