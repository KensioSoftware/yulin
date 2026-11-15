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
 * an account. A key is the clearest case: events a key was meant to protect
 * would be stored here without one.
 */
export function refuseUnsimulatedLogGroupInput(
  input: SimCreateLogGroupCommandInput,
): void {
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
