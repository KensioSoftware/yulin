import { SimLambdaError } from "../../error/sim-lambda.error.js";
import type { SimLambdaDestinationSend } from "./sim-lambda-destination-send.js";

/**
 * A queue a function is sending an asynchronous invocation result to, in the
 * Account and Region the destination ARN names.
 *
 * The message body is the record, as JSON, which is what real Lambda puts on a
 * queue destination.
 */
export class SimLambdaDestinationQueue {
  /**
   * Put the document on the queue.
   */
  async deliver(send: SimLambdaDestinationSend): Promise<void> {
    const queue = send.scope.sqs().findQueue(send.arn.resource);

    if (queue === undefined) {
      throw new SimLambdaError(
        `${send.arn.value} is not a simulated SQS queue.`,
      );
    }

    // Sent through the ordinary SendMessage path, so what arrives is the same
    // thing an SDK caller would have sent.
    await send.scope.sqs().sendMessage(
      { input: { QueueUrl: queue.arn.url, MessageBody: send.body } },
      {
        caller: { kind: "arn", arn: send.sourceFunctionRoleArn },
        sourceArn: send.sourceFunctionArn,
      },
    );
  }
}
