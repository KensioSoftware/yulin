import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimSnsBatchRequestTooLongException } from "../../error/sim-sns.error.js";
import {
  assertSimSnsMessageWithinLimit,
  simSnsMaximumPublishBytes,
  SimSnsPublishedMessage,
} from "../../message/sim-sns-published-message.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import {
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
}

/**
 * The commands that publish messages to a topic.
 *
 * A topic keeps nothing a publish sends it. Real SNS hands a message to the
 * topic's subscriptions and forgets it, so a topic with no subscriptions
 * accepts a publish, answers with a message id, and the message goes nowhere.
 * That is what a publish does here, since subscriptions are not simulated yet.
 */
export class SimSnsPublishCommands {
  private readonly access: SimSnsTopicAccess;
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSnsPublishCommandsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
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
    // it, which is all a publish needs of it while nothing subscribes.
    this.access.requireByArn(publishAction, command.input.TopicArn, options);

    const message = this.published(command.input);

    assertSimSnsMessageWithinLimit(message.byteSize);

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
    this.access.requireByArn(publishAction, command.input.TopicArn, options);

    const entries = requireSnsBatchEntries(
      command.input.PublishBatchRequestEntries,
    );
    const outcome = runSnsBatch(entries, (entry, id) => ({
      id,
      message: this.published(entry),
    }));

    this.assertBatchWithinSizeLimit(outcome.successful);

    const successful: readonly SimSnsPublishBatchResultEntry[] =
      outcome.successful.map(({ id, message }) => ({
        Id: id,
        MessageId: message.messageId,
      }));

    return { $metadata: {}, Successful: successful, Failed: outcome.failed };
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

  /**
   * Refuse a batch weighing more than one publish is allowed to.
   *
   * Real SNS holds the whole batch to the 256 KB a single publish is held to,
   * rather than each entry, so ten entries just inside the limit are one batch
   * far outside it.
   */
  private assertBatchWithinSizeLimit(
    published: readonly { readonly message: SimSnsPublishedMessage }[],
  ): void {
    const byteSize = published.reduce(
      (total, { message }) => total + message.byteSize,
      0,
    );

    if (byteSize > simSnsMaximumPublishBytes) {
      throw new SimSnsBatchRequestTooLongException(
        `The batch request is longer than the permitted size. A batch may be ` +
          `up to ${String(simSnsMaximumPublishBytes)} bytes, and this one is ` +
          `${String(byteSize)} bytes.`,
      );
    }
  }
}
