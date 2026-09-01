import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import {
  SimCloudFormationInvalidChangeSetStatusException,
  SimCloudFormationValidationError,
} from "../error/sim-cloudformation.error.js";
import type { SimCfnChangeSet } from "./sim-cfn-change-set.js";
import type { SimCfnChangeSetName } from "./sim-cfn-change-set.type.js";

interface SimCfnChangeSetLookup {
  /** A change set name, or the change set ARN CreateChangeSet returned. */
  readonly changeSetName: string;

  /** The Stack the change set belongs to, needed alongside a plain name. */
  readonly stackName?: string | undefined;
}

/**
 * The change sets one simulated CloudFormation holds, in the order they were
 * created.
 *
 * A change set is reached by its ARN on its own, or by its name together with
 * the Stack it belongs to, which is how CloudFormation reaches one. Two change
 * sets against different Stacks can carry the same name.
 */
export class SimCfnChangeSets {
  private changeSets: readonly SimCfnChangeSet[] = [];

  /** Hold a change set that has just been created. */
  add(changeSet: SimCfnChangeSet): void {
    this.changeSets = [...this.changeSets, changeSet];
  }

  /** Find a change set, or answer undefined where the lookup names none. */
  find(lookup: SimCfnChangeSetLookup): SimCfnChangeSet | undefined {
    const { changeSetName, stackName } = lookup;

    return this.changeSets.find((changeSet) => {
      if (changeSet.changeSetId === changeSetName) {
        return true;
      }

      return (
        changeSet.changeSetName === changeSetName &&
        stackName !== undefined &&
        changeSet.stackName === stackName
      );
    });
  }

  /**
   * Find a change set, refusing a lookup that names none the way
   * CloudFormation refuses it.
   */
  require(lookup: SimCfnChangeSetLookup): SimCfnChangeSet {
    const changeSet = this.find(lookup);

    if (changeSet === undefined) {
      throw new SimCloudFormationValidationError(
        `ChangeSet [${lookup.changeSetName}] does not exist`,
      );
    }

    return changeSet;
  }

  /**
   * Find a change set that can be executed, refusing one that cannot.
   *
   * A change set that failed to build, that has already been executed, or that
   * another execution has made obsolete is refused for the status it is in,
   * the way CloudFormation refuses it.
   */
  requireExecutable(lookup: SimCfnChangeSetLookup): SimCfnChangeSet {
    const changeSet = this.require(lookup);

    if (!changeSet.executable) {
      throw new SimCloudFormationInvalidChangeSetStatusException(
        `ChangeSet [${changeSet.changeSetId}] cannot be executed in its ` +
          `current status of [${changeSet.executionStatus}]`,
      );
    }

    return changeSet;
  }

  /** Whether this Stack already holds a change set under this name. */
  has(
    stackName: SimCloudFormationStackName,
    name: SimCfnChangeSetName,
  ): boolean {
    return this.find({ changeSetName: name, stackName }) !== undefined;
  }

  /** The change sets held against one Stack, in the order they were created. */
  forStack(stackName: SimCloudFormationStackName): readonly SimCfnChangeSet[] {
    return this.changeSets.filter(
      (changeSet) => changeSet.stackName === stackName,
    );
  }

  /** Take a change set away, for DeleteChangeSet. */
  remove(changeSet: SimCfnChangeSet): void {
    this.changeSets = this.changeSets.filter((held) => held !== changeSet);
  }

  /**
   * Give up on every other change set against this Stack, because the one
   * given has been executed and the Stack has moved on from what they saw.
   */
  markOthersObsolete(executed: SimCfnChangeSet): void {
    for (const changeSet of this.forStack(executed.stackName)) {
      if (changeSet !== executed && changeSet.executable) {
        changeSet.executionStatus = "OBSOLETE";
      }
    }
  }
}
