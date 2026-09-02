import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import {
  makeSimCfnStackId,
  type SimCfnStackId,
} from "../stack/sim-cfn-stack-id.js";

interface SimCfnChangeSetStackIdProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: ReadonlyMap<SimCloudFormationStackName, SimCfnStack>;
  readonly stackName: SimCloudFormationStackName;
}

/**
 * The Stack ID a change set's template resolves `AWS::StackId` to.
 *
 * An `UPDATE` change set is held against a Stack that already has one. A
 * `CREATE` change set brings the Stack into being, and this is the ID that
 * Stack keeps for the rest of its life.
 */
export function simCfnChangeSetStackId(
  properties: SimCfnChangeSetStackIdProperties,
): SimCfnStackId {
  const { accountRegionScope, stacks, stackName } = properties;

  return (
    stacks.get(stackName)?.stackId ??
    makeSimCfnStackId({ accountRegionScope, stackName })
  );
}
