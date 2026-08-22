import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";
import type { SimStatesChildWalks } from "./sim-states-child-walk.js";
import { SimStatesInterpreter } from "./sim-states-interpreter.js";

interface SimStatesWalksProperties {
  readonly background: BackgroundScheduler;

  /**
   * Where a `Task` state does its work.
   */
  readonly tasks: SimStatesTaskTargets;

  /**
   * The state machine's execution role, which a task assumes.
   */
  readonly roleArn: string;
}

/**
 * How one execution walks a set of states, its `Parallel` branches included.
 *
 * A branch is walked the way the execution around it is, on the same clock and
 * through the same tasks, so what it reaches is what any other state reaches.
 * The factory hands itself to the walks it builds, which is what lets a branch
 * hold a `Parallel` state of its own.
 */
export function simStatesWalks(
  properties: SimStatesWalksProperties,
): SimStatesChildWalks {
  const walks: SimStatesChildWalks = (child) =>
    new SimStatesInterpreter({
      definition: child.definition,
      record: child.record,
      background: properties.background,
      tasks: properties.tasks,
      roleArn: properties.roleArn,
      walkChild: walks,
      ...(child.onSettled !== undefined && { onSettled: child.onSettled }),
    });

  return walks;
}
