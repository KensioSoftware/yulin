import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSnsFanOut } from "../../delivery/sim-sns-fan-out.js";
import {
  assertSimSnsMessageWithinLimit,
  SimSnsPublishedMessage,
} from "../../message/sim-sns-published-message.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import {
  assertSnsBatchWithinSizeLimit,
  requireSnsBatchEntries,
  runSnsBatch,
} from "./sim-sns-batch-entries.js";
import {
  refuseUnsimulatedPublishTarget,
  simSnsPublishedMessageInput,
} from "./sim-sns-publish-input.js";
import type {
  SimPublishBatchCommand,
  SimPublishBatchCommandOutput,
  SimPublishCommand,
  SimPublishCommandOutput,
  SimSnsPublishBatchResultEntry,
  SimSnsPublishedFields,
} from "./publish.command.js";

/**
 * Real SNS authorizes a batch publish as `sns:Publish`. There is no
 * `sns:PublishBatch` action, so a policy naming one grants nothing.
 */
const publishAction = "sns:Publish";

interface SimSnsPublishCommandsProperties {
  readonly access: SimSnsTopicAccess;
  readonly clock: BackgroundScheduler;
  readonly fanOut: SimSnsFanOut;
}

/**
 * The commands that publish messages to a topic.
 *
 * A topic keeps nothing a publish sends it. Real SNS hands a message to the
 * topic's subscriptions and forgets it, so a topic with no subscriptions
 * accepts a publish, answers with a message id, and the message goes nowhere.
 * That is what a publish does here too, and a topic with subscriptions hands
 * each of them a copy on the background scheduler.
 */
export class SimSnsPublishCommands {
  private readonly access: SimSnsTopicAccess;
  private readonly clock: BackgroundScheduler;
  private readonly fanOut: SimSnsFanOut;

  constructor(properties: SimSnsPublishCommandsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
    this.fanOut = properties.fanOut;
  }

  /**
   * Publish one message to a topic.
   */
  publish(
    command: SimPublishCommand,
    options?: SimSnsRequestOptions,
  ): SimPublishCommandOutput {
    refuseUnsimulatedPublishTarget(command.input);

    // The topic has to be there and the caller has to be allowed to publish to
    // it before anything is read out of the message.
    const topic = this.access.requireByArn(
      publishAction,
      command.input.TopicArn,
      options,
    );
    const message = this.published(command.input);

    assertSimSnsMessageWithinLimit(message.byteSize);

    this.fanOut.publish(topic, message);

    return { $metadata: {}, MessageId: message.messageId };
  }

  /**
   * Publish up to ten messages to a topic at once.
   *
   * A message one entry cannot publish is reported in `Failed` while the rest
   * of the batch goes through, as real SNS reports it. The size limit is
   * different: it covers the whole batch, so a batch over it fails outright
   * rather than reporting one entry as the one that did not fit. That is why
   * no entry is held to the limit on its own here.
   */
  publishBatch(
    command: SimPublishBatchCommand,
    options?: SimSnsRequestOptions,
  ): SimPublishBatchCommandOutput {
    const topic = this.access.requireByArn(
      publishAction,
      command.input.TopicArn,
      options,
    );
    const entries = requireSnsBatchEntries(
      command.input.PublishBatchRequestEntries,
    );
    const outcome = runSnsBatch(entries, (entry, id) => ({
      id,
      message: this.published(entry),
    }));

    assertSnsBatchWithinSizeLimit(outcome.successful);
    this.fanOutBatch(topic, outcome.successful);

    const successful: readonly SimSnsPublishBatchResultEntry[] =
      outcome.successful.map(({ id, message }) => ({
        Id: id,
        MessageId: message.messageId,
      }));

    return { $metadata: {}, Successful: successful, Failed: outcome.failed };
  }

  /**
   * Hand every message a batch published to the topic's subscriptions.
   *
   * The whole batch is checked before any of it is delivered, because a batch
   * over the size limit fails outright, and a message from a failed request
   * should reach nothing.
   */
  private fanOutBatch(
    topic: SimSnsTopic,
    published: readonly { readonly message: SimSnsPublishedMessage }[],
  ): void {
    for (const { message } of published) {
      this.fanOut.publish(topic, message);
    }
  }

  /**
   * Read and check one message a request describes.
   */
  private published(published: SimSnsPublishedFields): SimSnsPublishedMessage {
    return SimSnsPublishedMessage.of(
      simSnsPublishedMessageInput(published),
      this.clock.now(),
    );
  }
}
