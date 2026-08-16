import { SimLogsUnsupportedOperationException } from "../../error/sim-logs.error.js";
import type { SimCreateLogGroupCommandInput } from "./group.command.js";

/**
 * The only log group class this simulation holds events for.
 *
 * The others change where events are stored and which operations reach them on
 * real CloudWatch Logs, and none of that is modelled here.
 */
export const simLogsStandardLogGroupClass = "STANDARD";

/**
 * Refuse the CreateLogGroup inputs this simulation does not model.
 *
 * Each of these changes what the log group does on real AWS, so accepting one
 * and dropping it would let a request succeed here and behave differently in
 * an account. A tag is the clearest case: the group would look tagged to the
 * request that made it and untagged to everything else.
 */
export function refuseUnsimulatedLogGroupInput(
  input: SimCreateLogGroupCommandInput,
): void {
  if (input.tags !== undefined) {
    throw new SimLogsUnsupportedOperationException(
      "Log group tags are not simulated, so CreateLogGroup refuses them " +
        "rather than dropping them",
    );
  }

  if (input.kmsKeyId !== undefined) {
    throw new SimLogsUnsupportedOperationException(
      "Log group encryption is not simulated, so CreateLogGroup refuses " +
        "kmsKeyId rather than storing events a key was meant to protect",
    );
  }

  if (
    input.logGroupClass !== undefined &&
    input.logGroupClass !== simLogsStandardLogGroupClass
  ) {
    throw new SimLogsUnsupportedOperationException(
      `Log group class '${input.logGroupClass}' is not simulated: only ` +
        `${simLogsStandardLogGroupClass} is, which is the class every ` +
        `operation here behaves as`,
    );
  }
}
