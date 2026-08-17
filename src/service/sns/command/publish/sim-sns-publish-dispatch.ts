import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsPublishCommands } from "./sim-sns-publish-commands.js";
import { refuseUnsimulatedPublishTarget } from "./sim-sns-publish-input.js";
import type { SimSnsPublishSms } from "./sim-sns-publish-sms.js";
import type {
  SimPublishBatchCommand,
  SimPublishBatchCommandOutput,
  SimPublishCommand,
  SimPublishCommandOutput,
} from "./publish.command.js";

interface SimSnsPublishDispatchProperties {
  readonly topic: SimSnsPublishCommands;
  readonly sms: SimSnsPublishSms;
}

/**
 * Which of the two publishes a `Publish` request is.
 *
 * One SDK command name covers two operations that share a message and nothing
 * else. A publish to a topic goes to the topic's subscriptions. A publish to a
 * phone number reaches no topic, no subscription and no delivery endpoint, and
 * is recorded as an SMS. Each has its own handler, and this is what reads the
 * request to decide.
 *
 * The target refusals belong here, ahead of the decision, so that a request
 * naming an unsimulated target is refused whichever way it would otherwise
 * have gone.
 *
 * `PublishBatch` is only ever a topic publish, since the SNS API gives a batch
 * entry no phone number field.
 */
export class SimSnsPublishDispatch {
  private readonly topic: SimSnsPublishCommands;
  private readonly sms: SimSnsPublishSms;

  constructor(properties: SimSnsPublishDispatchProperties) {
    this.topic = properties.topic;
    this.sms = properties.sms;
  }

  /**
   * Publish one message to a topic or to a phone number.
   */
  publish(
    command: SimPublishCommand,
    options?: SimSnsRequestOptions,
  ): SimPublishCommandOutput {
    refuseUnsimulatedPublishTarget(command.input);

    if (command.input.PhoneNumber === undefined) {
      return this.topic.publish(command, options);
    }

    return this.sms.publish(command.input, options);
  }

  /**
   * Publish up to ten messages to a topic at once.
   */
  publishBatch(
    command: SimPublishBatchCommand,
    options?: SimSnsRequestOptions,
  ): SimPublishBatchCommandOutput {
    return this.topic.publishBatch(command, options);
  }
}
