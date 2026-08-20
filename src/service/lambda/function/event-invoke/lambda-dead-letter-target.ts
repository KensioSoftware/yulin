import { SimLambdaDestinationArn } from "../../destination/sim-lambda-destination-arn.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";

/**
 * Where a function sends the asynchronous events it gave up on.
 */
export interface SimLambdaDeadLetterConfigInput {
  readonly TargetArn?: string | undefined;
}

/**
 * Read a function's dead-letter target, refusing one that cannot receive.
 *
 * Real Lambda dead-letters to a queue or a topic and nowhere else, so an ARN
 * naming anything else is refused while the caller is still there to see it.
 * An empty `TargetArn` is how AWS takes a dead-letter target away, and it
 * comes back as an empty string so a caller clearing one is told apart from a
 * caller saying nothing about it.
 */
export function requireLambdaDeadLetterTarget(
  config: SimLambdaDeadLetterConfigInput | undefined,
): string | undefined {
  if (config?.TargetArn === undefined) {
    return undefined;
  }

  if (config.TargetArn === "") {
    return "";
  }

  const arn = SimLambdaDestinationArn.of(config.TargetArn);

  if (arn.service !== "sqs" && arn.service !== "sns") {
    throw new SimLambdaInvalidParameterValueException(
      `The dead-letter target ${arn.value} names ${arn.service}. A ` +
        "dead-letter target is an SQS queue or an SNS topic.",
    );
  }

  return arn.value;
}
