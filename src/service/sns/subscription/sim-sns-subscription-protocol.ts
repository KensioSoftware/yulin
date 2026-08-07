import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

/**
 * Delivery to an SQS queue.
 *
 * A queue is what SNS is most often put in front of, and it is a protocol with
 * no confirmation step: real SNS confirms an `sqs` subscription itself, so
 * `Subscribe` answers with a subscription ARN rather than `pending
 * confirmation`.
 */
export const simSnsSqsProtocol = "sqs";

/**
 * Delivery by invoking a Lambda function.
 *
 * Real SNS confirms this one itself too, so a `lambda` subscription is
 * confirmed as soon as it exists. The function is invoked asynchronously with
 * an event carrying the published message.
 */
export const simSnsLambdaProtocol = "lambda";

/**
 * A protocol a simulated subscription can be created with.
 */
export type SimSnsSubscriptionProtocol =
  typeof simSnsSqsProtocol | typeof simSnsLambdaProtocol;

/**
 * The protocols real SNS has that this simulation does not deliver over.
 *
 * Each is refused by name with the reason, rather than accepted and never
 * delivered to. A subscription that exists and receives nothing is worse than
 * no subscription at all: the test that made it would be asserting against
 * silence.
 */
const unsimulatedProtocols = new Map<string, string>([
  ["http", "Delivery over HTTP would leave the simulation."],
  ["https", "Delivery over HTTPS would leave the simulation."],
  ["email", "Sending email is not simulated."],
  ["email-json", "Sending email is not simulated."],
  ["sms", "Sending SMS is not simulated."],
  [
    "application",
    "Mobile application endpoints and push notifications are not simulated.",
  ],
  ["firehose", "Amazon Data Firehose is not simulated."],
]);

/**
 * Read the protocol a Subscribe request names, refusing one that delivers
 * nowhere.
 *
 * Real SNS refuses a protocol it does not have with
 * `InvalidParameterException`, and that is what a misspelling gets here. A
 * protocol real SNS does have and this simulation does not is refused with the
 * reason it is missing, so the message points at the simulator rather than at
 * the request.
 */
export function requireSimSnsProtocol(
  value: string | undefined,
): SimSnsSubscriptionProtocol {
  if (value === simSnsSqsProtocol || value === simSnsLambdaProtocol) {
    return value;
  }

  const named = value ?? "(none)";
  const reason = unsimulatedProtocols.get(named);

  if (reason !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      `The ${named} subscription protocol is not simulated. ${reason} ` +
        `Subscribe with the ${simSnsSqsProtocol} or ` +
        `${simSnsLambdaProtocol} protocol instead.`,
    );
  }

  throw new SimSnsInvalidParameterException(
    `Invalid parameter: Protocol Reason: ${named} is not a subscription ` +
      `protocol`,
  );
}
