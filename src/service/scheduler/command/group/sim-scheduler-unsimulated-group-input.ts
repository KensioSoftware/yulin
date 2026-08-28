import { SimSchedulerUnsimulatedInputException } from "../../error/sim-scheduler.error.js";
import type { SimCreateScheduleGroupCommandInput } from "./group.command.js";

/**
 * Refuse the group request inputs this simulation does not model.
 *
 * Tagging is most of what AWS says a group is for, and nothing here reads a
 * tag back, so a group created without them would look tagged to whoever
 * asked and untagged to everything else. An empty list asks for no tags, so
 * there is nothing to drop and nothing to refuse.
 *
 * A template is treated differently. The CDK puts a Stack's tags on a group
 * without being asked, and failing a Stack over them would be a refusal nobody
 * wrote.
 */
export function refuseUnsimulatedGroupInput(
  input: SimCreateScheduleGroupCommandInput,
): void {
  if (input.Tags !== undefined && input.Tags.length > 0) {
    throw new SimSchedulerUnsimulatedInputException(
      "Schedule group tags are not simulated, so CreateScheduleGroup " +
        "refuses them rather than dropping them",
    );
  }
}
