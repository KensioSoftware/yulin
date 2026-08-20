import { SimLambdaError } from "../../error/sim-lambda.error.js";
import type { SimLambdaDestinationSend } from "./sim-lambda-destination-send.js";

/**
 * A topic a function is sending an asynchronous invocation result to, in the
 * Account and Region the destination ARN names.
 *
 * The topic then fans the record out to its own subscriptions, so each
 * subscriber sees it inside SNS's envelope.
 */
export class SimLambdaDestinationTopic {
  /**
   * Publish the document to the topic.
   */
  async deliver(send: SimLambdaDestinationSend): Promise<void> {
    const topic = send.scope.sns().findTopic(send.arn.resource);

    if (topic === undefined) {
      throw new SimLambdaError(
        `${send.arn.value} is not a simulated SNS topic.`,
      );
    }

    await send.scope
      .sns()
      .publish(
        { input: { TopicArn: topic.arn.value, Message: send.body } },
        { sourceArn: send.sourceFunctionArn },
      );
  }
}
