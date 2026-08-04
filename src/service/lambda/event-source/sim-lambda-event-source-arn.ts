import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import { SimLambdaSqsEventSourceArn } from "./queue/sim-lambda-sqs-event-source-arn.js";

/**
 * The ARN of an event source a mapping can name.
 *
 * A union discriminated by `kind`, so the poller a mapping gets, the
 * permissions its execution role is checked for and the batch sizes it may ask
 * for all come from the source the mapping names rather than being assumed.
 */
export type SimLambdaEventSourceArn = SimLambdaSqsEventSourceArn;

/**
 * What this simulation polls, said in one place so every refusal that mentions
 * it says the same thing.
 */
export const simulatedEventSourcesDescription =
  "SQS queues are the only simulated event source";

/**
 * The ARN shapes those event sources are named by.
 */
const simulatedEventSourceArnShapes: readonly string[] = [
  SimLambdaSqsEventSourceArn.arnShape,
];

/**
 * Read an event source ARN, refusing one that names no simulated event source.
 *
 * This is the one place that decides which sources a mapping may name. A source
 * this simulation cannot poll is refused rather than accepted and never
 * delivered from.
 */
export function simLambdaEventSourceArnOf(
  eventSourceArn: string,
): SimLambdaEventSourceArn {
  const queueArn = SimLambdaSqsEventSourceArn.parse(eventSourceArn);

  if (queueArn === undefined) {
    const arnShapes = simulatedEventSourceArnShapes.join(" ");

    throw new SimLambdaInvalidParameterValueException(
      `EventSourceArn ${eventSourceArn} names no simulated Lambda event ` +
        `source. ${simulatedEventSourcesDescription}. ${arnShapes}`,
    );
  }

  return queueArn;
}
