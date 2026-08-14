import { SimEcrRepository } from "../../../../ecr/repository/sim-ecr-repository.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimEcrRepositoryCfn } from "./sim-ecr-repository-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated ECR Resource.
 */
export function ecrValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::ECR::Repository" &&
    properties.simResource instanceof SimEcrRepository
  ) {
    return new SimEcrRepositoryCfn({ repository: properties.simResource });
  }

  return undefined;
}
