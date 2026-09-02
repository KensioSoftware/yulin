import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { SimCfnStackId } from "../stack/sim-cfn-stack-id.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import {
  SimCloudFormationAlreadyExistsException,
  SimCloudFormationValidationError,
} from "../error/sim-cloudformation.error.js";
import type { SimCfnChangeSetType } from "./sim-cfn-change-set.type.js";

interface SimCfnChangeSetStackProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly stackName: SimCloudFormationStackName;
  readonly stackId: SimCfnStackId;
  readonly type: SimCfnChangeSetType;
  readonly template: SimCfnTemplate;
  readonly caller?: SimAwsCaller | undefined;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * The Stack a change set is held against.
 *
 * A `CREATE` change set brings the Stack into being in review, which is the
 * status a Stack holds before anything has deployed it. Its Resources are
 * worked out from the template and none of them is created, so executing the
 * change set is what deploys them.
 *
 * An `UPDATE` change set needs a Stack that is already there, and leaves it
 * exactly as it is.
 */
export function simCfnChangeSetStack(
  properties: SimCfnChangeSetStackProperties,
): SimCfnStack {
  const { stacks, stackName, type } = properties;
  const deployed = stacks.get(stackName);

  if (type === "UPDATE") {
    if (deployed === undefined) {
      throw new SimCloudFormationValidationError(
        `Stack [${stackName}] does not exist`,
      );
    }

    return deployed;
  }

  if (deployed !== undefined) {
    throw new SimCloudFormationAlreadyExistsException(
      `Stack [${stackName}] already exists`,
    );
  }

  const stack = new SimCfnStack({
    simAws: properties.simAws,
    accountRegionScope: properties.accountRegionScope,
    background: properties.background,
    stackName,
    stackId: properties.stackId,
    template: properties.template,
    caller: properties.caller,
    exports: properties.exports,
  });

  stacks.set(stack.stackName, stack);

  return stack;
}

/**
 * The Stack a change set was created against, for executing it.
 *
 * A Stack that has gone since the change set was created leaves the change set
 * naming nothing, which CloudFormation refuses the way it refuses any command
 * naming a Stack it cannot find.
 */
export function simCfnChangeSetDeployedStack(
  stacks: ReadonlyMap<SimCloudFormationStackName, SimCfnStack>,
  changeSet: { readonly stackName: SimCloudFormationStackName },
): SimCfnStack {
  const stack = stacks.get(changeSet.stackName);

  if (stack === undefined) {
    throw new SimCloudFormationValidationError(
      `Stack [${changeSet.stackName}] does not exist`,
    );
  }

  return stack;
}
