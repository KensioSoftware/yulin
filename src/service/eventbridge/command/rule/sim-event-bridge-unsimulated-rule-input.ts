import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";
import type { SimPutRuleCommandInput } from "./rule.command.js";

/**
 * The maximum length real EventBridge takes for a rule description.
 */
const maximumDescriptionLength = 512;

/**
 * Refuse the rule request inputs this simulation does not model.
 *
 * A role and tags are refused because dropping either would leave a rule
 * looking configured to the request that sent it and unconfigured to
 * everything else.
 */
export function refuseUnsimulatedRuleInput(
  input: SimPutRuleCommandInput,
): void {
  if (input.RoleArn !== undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "A rule RoleArn is not simulated, so PutRule refuses one rather than " +
        "creating a rule that reaches its targets as somebody else",
    );
  }

  if (input.Tags !== undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "Rule tags are not simulated, so PutRule refuses them rather than " +
        "dropping them",
    );
  }

  if (
    input.Description !== undefined &&
    input.Description.length > maximumDescriptionLength
  ) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: Description Reason: a description is at most ${String(maximumDescriptionLength)} characters, and this one is ${String(input.Description.length)}`,
    );
  }
}
