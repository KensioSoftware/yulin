import { SimSnsUnsimulatedInputException } from "../../error/sim-sns.error.js";
import type { SimCreateTopicCommandInput } from "./topic.command.js";

/**
 * Refuse the topic request inputs this simulation does not model.
 *
 * A data protection policy that redacted nothing would be a policy a test
 * believed was protecting the messages going through the topic, so one is
 * refused instead.
 */
export function refuseUnsimulatedTopicInput(
  input: SimCreateTopicCommandInput,
): void {
  if (input.DataProtectionPolicy !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "Data protection policies are not simulated, so CreateTopic refuses " +
        "one rather than creating a topic that redacts nothing",
    );
  }
}
