import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { SimCfnChangeSet } from "./sim-cfn-change-set.js";
import type { SimCfnChangeSets } from "./sim-cfn-change-sets.js";

interface SimCfnChangeSetExecutionProperties {
  readonly changeSet: SimCfnChangeSet;
  readonly stack: SimCfnStack;
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Start the Stack operation a change set describes.
 *
 * A `CREATE` change set deploys the Stack it brought into being, and an
 * `UPDATE` change set applies its template to the Stack it was worked out
 * against. Either way the work is scheduled in the background, so this returns
 * once the operation has started.
 *
 * Every other executable change set against the Stack becomes obsolete, because
 * each was worked out against a Stack this execution has moved on.
 */
export async function runSimCfnChangeSet(
  properties: SimCfnChangeSetExecutionProperties,
): Promise<void> {
  const { changeSet, stack, changeSets, background, caller } = properties;

  changeSet.executionStatus = "EXECUTE_IN_PROGRESS";

  try {
    await (changeSet.type === "CREATE"
      ? stack.deploy()
      : stack.update(changeSet.template, { caller }));
  } catch (error) {
    changeSet.executionStatus = "EXECUTE_FAILED";

    throw error;
  }

  changeSets.markOthersObsolete(changeSet);
  settleExecution(changeSet, stack, background);
}

/**
 * Record how the Stack operation went, once it has finished in the background.
 *
 * The failure itself belongs to the Stack, which holds it as a failed status
 * and rethrows it to whoever waits for the operation. This only reads which way
 * it went, so a change set describes its own execution as well as the Stack
 * describes the deployment or update behind it.
 */
function settleExecution(
  changeSet: SimCfnChangeSet,
  stack: SimCfnStack,
  background: BackgroundScheduler,
): void {
  background.schedule(async () => {
    try {
      await (changeSet.type === "CREATE"
        ? stack.waitForDeployComplete()
        : stack.waitForUpdateComplete());

      changeSet.executionStatus = "EXECUTE_COMPLETE";
    } catch {
      changeSet.executionStatus = "EXECUTE_FAILED";
    }
  });
}
