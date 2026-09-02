import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../sim-cfn-stack.type.js";

/**
 * Refuse an update while one is already running, or being rolled back.
 *
 * CloudFormation takes one update at a time. A second here would read the
 * difference to apply from a Stack half way through the first, or from one
 * being put back on the template it was deployed from.
 */
export function assertSimCfnStackNotUpdating(
  stackName: SimCloudFormationStackName,
  status: SimCloudFormationStackStatus | undefined,
): void {
  if (
    status === "UPDATE_IN_PROGRESS" ||
    status === "UPDATE_ROLLBACK_IN_PROGRESS"
  ) {
    throw new SimCloudFormationValidationError(
      `Stack ${stackName} is in ${status} state and can not be updated`,
    );
  }
}
