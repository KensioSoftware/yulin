import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import { SimSqsValidationException } from "../../error/sim-sqs.error.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import { SimSqsQueueAttributeNames } from "../../queue/sim-sqs-queue-attribute-names.js";
import type { SimSqsQueueAccess } from "./sim-sqs-queue-access.js";
import type {
  SimGetQueueAttributesCommand,
  SimGetQueueAttributesCommandOutput,
  SimPurgeQueueCommand,
  SimPurgeQueueCommandOutput,
  SimSetQueueAttributesCommand,
  SimSetQueueAttributesCommandOutput,
} from "./queue.command.js";

interface SimSqsQueueAttributeCommandsProperties {
  readonly access: SimSqsQueueAccess;
  readonly clock: BackgroundScheduler;
}

/**
 * The commands that read and change what a queue does, rather than what is on it.
 */
export class SimSqsQueueAttributeCommands {
  private readonly access: SimSqsQueueAccess;
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsQueueAttributeCommandsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
  }

  /**
   * Read the attributes a request asks for.
   *
   * Only the named attributes come back, as on real SQS, so a request naming
   * none gets none. `All` names every attribute this simulation holds; an
   * attribute real SQS has and this simulation does not is left out rather than
   * refused, because that is what real SQS does with an attribute a queue has no
   * value for.
   */
  getQueueAttributes(
    command: SimGetQueueAttributesCommand,
    options?: SimSqsRequestOptions,
  ): SimGetQueueAttributesCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:GetQueueAttributes",
      command.input.QueueUrl,
      options,
    );
    const requested = command.input.AttributeNames ?? [];

    for (const name of requested) {
      SimSqsQueueAttributeNames.assertReadable(name);
    }

    const reported = this.reportedAttributes(queue, requested);

    if (reported === undefined) {
      return { $metadata: {} };
    }

    return { $metadata: {}, Attributes: reported };
  }

  /**
   * Change the attributes of a queue.
   */
  setQueueAttributes(
    command: SimSetQueueAttributesCommand,
    options?: SimSqsRequestOptions,
  ): SimSetQueueAttributesCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:SetQueueAttributes",
      command.input.QueueUrl,
      options,
    );
    const requested = command.input.Attributes;

    if (requested === undefined) {
      throw new SimSqsValidationException(
        "SetQueueAttributes requires Attributes",
      );
    }

    queue.applyAttributes(requested, this.clock.now());

    return { $metadata: {} };
  }

  /**
   * Delete every message on a queue.
   *
   * Real SQS takes up to 60 seconds over a purge, during which messages sent
   * before it may still be deleted and messages sent during it may still be
   * purged. This purge happens at once, which is a deliberate simplification: a
   * test can then assert on an empty queue immediately.
   */
  purgeQueue(
    command: SimPurgeQueueCommand,
    options?: SimSqsRequestOptions,
  ): SimPurgeQueueCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:PurgeQueue",
      command.input.QueueUrl,
      options,
    );

    queue.purge(this.clock.now());

    return { $metadata: {} };
  }

  private reportedAttributes(
    queue: SimSqsQueue,
    requested: readonly string[],
  ): Record<string, string> | undefined {
    if (requested.length === 0) {
      return undefined;
    }

    const available = queue.reportedAttributes(this.clock.now());
    const selected = available
      .entries()
      .filter(([name]) => requested.includes("All") || requested.includes(name))
      .toArray();

    if (selected.length === 0) {
      return undefined;
    }

    return Object.fromEntries(selected);
  }
}
