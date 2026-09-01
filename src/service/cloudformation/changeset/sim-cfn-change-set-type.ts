import { SimCloudFormationValidationError } from "../error/sim-cloudformation.error.js";
import type { SimCfnChangeSetType } from "./sim-cfn-change-set.type.js";

/**
 * What CloudFormation answers a change set that would change nothing.
 */
export const simCfnChangeSetNoChangesMessage =
  "The submitted information didn't contain changes. " +
  "Submit different information to create a change set.";

/**
 * Read the ChangeSetType a CreateChangeSet input asks for.
 *
 * CloudFormation defaults to `UPDATE`. `IMPORT` is outside the simulation,
 * because nothing here can adopt a Resource it did not create.
 */
export function simCfnChangeSetType(
  changeSetType: string | undefined,
): SimCfnChangeSetType {
  if (changeSetType === undefined || changeSetType === "UPDATE") {
    return "UPDATE";
  }

  if (changeSetType === "CREATE") {
    return "CREATE";
  }

  throw new SimCloudFormationValidationError(
    `Sim CloudFormation ChangeSetType ${changeSetType} is not supported`,
  );
}
