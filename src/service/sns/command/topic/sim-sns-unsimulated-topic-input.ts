import { SimSnsUnsimulatedInputException } from "../../error/sim-sns.error.js";
import type { SimCreateTopicCommandInput } from "./topic.command.js";

/**
 * Refuse the topic request inputs this simulation does not model.
 *
 * Dropping a tag would leave a topic looking tagged to the request that sent it
 * and untagged to everything else, and a data protection policy that redacted
 * nothing would be a policy a test believed was protecting the messages going
 * through the topic. Both are refused instead.
 */
export function refuseUnsimulatedTopicInput(
  input: SimCreateTopicCommandInput,
): void {
  if (input.Tags !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "Topic tags are not simulated, so CreateTopic refuses them rather than " +
        "dropping them",
    );
  }

  if (input.DataProtectionPolicy !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      "Data protection policies are not simulated, so CreateTopic refuses " +
        "one rather than creating a topic that redacts nothing",
    );
  }
}
