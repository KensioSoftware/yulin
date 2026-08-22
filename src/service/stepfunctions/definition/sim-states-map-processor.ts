import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import type { SimStatesDefinition } from "./sim-states-definition.js";
import { parseSimStatesDefinitionDocument } from "./sim-states-definition-parse.js";
import { simStatesNestedRefusal } from "./sim-states-nested-refusal.js";

/**
 * The execution model a `Map` state's processor runs under.
 */
const inlineMode = "INLINE";

/**
 * Read the states one `Map` state runs per item.
 *
 * `Iterator` is what `ItemProcessor` used to be called, and CDK still emits it
 * for a `Map` built with the deprecated `iterator()` call, so both are read.
 * A state machine carrying both says the same thing twice.
 */
export function readSimStatesMapProcessor(
  named: string,
  state: Record<string, JSONValue>,
): SimStatesDefinition {
  const processor = state["ItemProcessor"];
  const iterator = state["Iterator"];

  if (processor !== undefined && iterator !== undefined) {
    throw new SimStatesInvalidDefinition(
      `The ${named} carries both ItemProcessor and Iterator. Iterator is the ` +
        "older spelling of ItemProcessor, and a Map state carries one of them.",
    );
  }

  const written = processor ?? iterator;

  if (!isRecord(written)) {
    throw new SimStatesInvalidDefinition(
      `The ${named} needs an ItemProcessor holding the states it runs for ` +
        "each item.",
    );
  }

  checkProcessorConfig(named, written["ProcessorConfig"]);

  return read(named, written);
}

/**
 * Refuse a processor that runs as a Distributed Map.
 */
function checkProcessorConfig(
  named: string,
  config: JSONValue | undefined,
): void {
  if (!isRecord(config)) {
    return;
  }

  const mode = config["Mode"];

  if (mode !== undefined && mode !== inlineMode) {
    throw new SimStatesUnsimulatedInput(
      `The ${named} has a ProcessorConfig Mode of ${JSON.stringify(mode)}, ` +
        `which this simulator does not run. It runs ${inlineMode}, where the ` +
        "iterations are states of the execution that reached the Map state.",
    );
  }
}

/**
 * Read the processor's states, saying which state they belong to.
 */
function read(
  named: string,
  written: Record<string, JSONValue>,
): SimStatesDefinition {
  try {
    return parseSimStatesDefinitionDocument(written);
  } catch (error) {
    throw simStatesNestedRefusal(`The ItemProcessor of the ${named}`, error);
  }
}
