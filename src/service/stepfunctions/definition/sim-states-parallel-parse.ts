import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
  SimStepFunctionsError,
} from "../error/sim-step-functions.error.js";
import { parseSimStatesErrorHandling } from "../retry/sim-states-error-handling.js";
import type { SimStatesDefinition } from "./sim-states-definition.js";
import { parseSimStatesDefinitionDocument } from "./sim-states-definition-parse.js";
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
 *
 * The refusal a branch raises names the state inside it, so the position of
 * the branch is put in front of it. Two branches are free to use the same
 * state name, and without the position the two refusals would read alike.
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
    throw branchRefusal(where, error);
  }
}

/**
 * The same refusal, saying which branch raised it.
 *
 * A branch using an unsimulated construct keeps that name, since it is the
 * one telling a reader that the definition is good and this simulator is
 * behind. Everything else a branch is refused for is a fault in the
 * definition.
 */
function branchRefusal(where: string, error: unknown): unknown {
  if (error instanceof SimStatesUnsimulatedInput) {
    return new SimStatesUnsimulatedInput(`${where}: ${error.message}`);
  }

  if (error instanceof SimStepFunctionsError) {
    return new SimStatesInvalidDefinition(`${where}: ${error.message}`);
  }

  return error;
}
