import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  type SimStatesDataFlowFields,
  simStatesEffectiveOutput,
} from "../data/sim-states-data-flow.js";
import type { SimStatesMoveOnOutcome } from "./sim-states-state-outcome.js";

/**
 * The state a fan-out belongs to, as far as its answer is concerned.
 */
interface SimStatesFanOutState extends SimStatesDataFlowFields {
  readonly Next?: string;
}

/**
 * What a state that ran states of its own answers with.
 *
 * The result is an array of what each child produced, in the order the
 * children were written rather than the order they finished. The data-flow
 * fields then apply to that array the way they apply to any other result.
 */
export function simStatesFanOutOutcome(
  state: SimStatesFanOutState,
  input: JSONValue,
  outputs: readonly JSONValue[],
): SimStatesMoveOnOutcome {
  const output = simStatesEffectiveOutput(input, [...outputs], state);

  return state.Next === undefined
    ? { kind: "succeed", output }
    : { kind: "next", output, next: state.Next };
}
