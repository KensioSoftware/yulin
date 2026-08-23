import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesUnsimulatedInput } from "../error/sim-step-functions.error.js";
import { parseSimStatesErrorHandling } from "../retry/sim-states-error-handling.js";
import {
  readSimStatesItemSelector,
  readSimStatesItemsPath,
  readSimStatesMaxConcurrency,
} from "./sim-states-map-fields.js";
import { readSimStatesMapProcessor } from "./sim-states-map-processor.js";
import type { SimStatesMapState } from "./sim-states-state.js";

/**
 * The fields of a `Map` state this simulator has no implementation for.
 *
 * All of them belong to a Distributed Map, which reads its items from S3, runs
 * a child execution per batch and writes the results back. That is a second
 * execution model rather than a field or two on this one.
 */
const mapFieldsUnsimulated = [
  "ItemReader",
  "ItemBatcher",
  "ResultWriter",
  "ToleratedFailureCount",
  "ToleratedFailureCountPath",
  "ToleratedFailurePercentage",
  "ToleratedFailurePercentagePath",
  "Label",
  "MaxConcurrencyPath",
  "Items",
] as const;

/**
 * Read a `Map` state, whose item processor is read as the state is.
 *
 * The processor is a state machine of its own, so the states inside it are
 * read the same way the states around them are. `Parameters` is the older
 * spelling of `ItemSelector` and arrives as one, which leaves a `Map` state
 * with no data-flow `Parameters` of its own.
 */
export function readSimStatesMapState(
  name: string,
  state: Record<string, JSONValue>,
): SimStatesMapState {
  const named = `Map state ${name}`;

  checkUnsimulated(named, state);

  const { Parameters, ...written } = state;

  return {
    ...(written as unknown as SimStatesMapState),
    ItemProcessor: readSimStatesMapProcessor(named, state),
    ...readSimStatesItemSelector(named, state, Parameters),
    ...readSimStatesItemsPath(named, state),
    ...readSimStatesMaxConcurrency(named, state),
    ...parseSimStatesErrorHandling(named, state),
  };
}

/**
 * Refuse the fields a Distributed Map carries.
 */
function checkUnsimulated(
  named: string,
  state: Record<string, JSONValue>,
): void {
  const present = mapFieldsUnsimulated.filter((field) =>
    Object.hasOwn(state, field),
  );

  if (present.length > 0) {
    throw new SimStatesUnsimulatedInput(
      `The ${named} carries ${present.join(", ")}, which this simulator does ` +
        "not run. Those fields belong to a Distributed Map, which reads its " +
        "items from S3 and runs a child execution per batch.",
    );
  }
}
