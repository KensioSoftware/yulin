import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import { parseSimStatesErrorHandling } from "../retry/sim-states-error-handling.js";
import type { SimStatesDefinition } from "./sim-states-definition.js";
import { parseSimStatesDefinitionDocument } from "./sim-states-definition-parse.js";
import { simStatesNestedRefusal } from "./sim-states-nested-refusal.js";
import type { SimStatesParallelState } from "./sim-states-state.js";

/**
 * Read a `Parallel` state, whose branches are read as the state is.
 *
 * A branch is a state machine of its own, so the states inside one are read
 * the same way the states around it are.
 */
export function readSimStatesParallelState(
  name: string,
  state: Record<string, JSONValue>,
): SimStatesParallelState {
  const named = `Parallel state ${name}`;

  return {
    ...(state as unknown as SimStatesParallelState),
    Branches: parseSimStatesBranches(named, state),
    ...parseSimStatesErrorHandling(named, state),
  };
}

/**
 * Read a `Parallel` state's `Branches`.
 *
 * Each branch is a state machine of its own and is read as one, so a branch
 * using something this simulator does not run is refused when the state
 * machine is created rather than when an execution reaches the state.
 */
function parseSimStatesBranches(
  named: string,
  state: Record<string, JSONValue>,
): readonly SimStatesDefinition[] {
  const declared = state["Branches"];

  if (!Array.isArray(declared) || declared.length === 0) {
    throw new SimStatesInvalidDefinition(
      `The ${named} needs a Branches array holding at least one branch.`,
    );
  }

  return declared.map((branch, index) => readBranch(named, index, branch));
}

/**
 * Read one branch, saying which branch it was where it cannot be read.
 */
function readBranch(
  named: string,
  index: number,
  branch: JSONValue,
): SimStatesDefinition {
  const where = `Branch ${String(index + 1)} of the ${named}`;

  if (!isRecord(branch)) {
    throw new SimStatesInvalidDefinition(
      `${where} is not an object. A branch is a state machine of its own, ` +
        "with its own StartAt and States.",
    );
  }

  try {
    return parseSimStatesDefinitionDocument(branch);
  } catch (error) {
    throw simStatesNestedRefusal(where, error);
  }
}
