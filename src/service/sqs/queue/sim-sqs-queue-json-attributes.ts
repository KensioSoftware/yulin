import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";
import {
  simSqsQueuePolicyAttributeName,
  simSqsRedrivePolicyAttributeName,
} from "./sim-sqs-queue-attribute-specs.js";
import { SimSqsQueueJsonAttribute } from "./sim-sqs-queue-json-attribute.js";
import { SimSqsQueuePolicy } from "./sim-sqs-queue-policy.js";
import { SimSqsRedrivePolicy } from "./sim-sqs-redrive-policy.js";

/**
 * The JSON documents one queue holds: its redrive policy and its own policy.
 *
 * They are kept together and apart from the numeric attributes because they
 * behave the same way as each other and differently from an amount. Each is
 * absent until it is set, parsed and validated when it is set, and reported
 * back as the string it was set with.
 */
export class SimSqsQueueJsonAttributes {
  private readonly redrive: SimSqsQueueJsonAttribute<SimSqsRedrivePolicy>;
  private readonly policy: SimSqsQueueJsonAttribute<SimSqsQueuePolicy>;

  private constructor(
    redrive: SimSqsQueueJsonAttribute<SimSqsRedrivePolicy>,
    policy: SimSqsQueueJsonAttribute<SimSqsQueuePolicy>,
  ) {
    this.redrive = redrive;
    this.policy = policy;
  }

  /**
   * The documents a queue created with no attributes holds, which is neither
   * of them.
   */
  static defaults(): SimSqsQueueJsonAttributes {
    return new this(
      new SimSqsQueueJsonAttribute({
        name: simSqsRedrivePolicyAttributeName,
        parse: (value) => SimSqsRedrivePolicy.parse(value),
        held: undefined,
      }),
      new SimSqsQueueJsonAttribute({
        name: simSqsQueuePolicyAttributeName,
        parse: (value) => SimSqsQueuePolicy.parse(value),
        held: undefined,
      }),
    );
  }

  /** Where failed messages go, and after how many receives, if anywhere. */
  get redrivePolicy(): SimSqsRedrivePolicy | undefined {
    return this.redrive.document;
  }

  /** Who the queue itself admits, if anyone. */
  get queuePolicy(): SimSqsQueuePolicy | undefined {
    return this.policy.document;
  }

  /**
   * These attributes after a request, holding what it sets and keeping what it
   * does not mention.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueJsonAttributes {
    return new SimSqsQueueJsonAttributes(
      this.redrive.with(requested),
      this.policy.with(requested),
    );
  }

  /**
   * Whether every document a request names is the one already held.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    return this.redrive.matches(requested) && this.policy.matches(requested);
  }

  /**
   * Add these attributes to what SQS reports about the queue, leaving out
   * whichever of them the queue has no value for.
   */
  reportInto(reported: Map<string, string>): void {
    this.redrive.reportInto(reported);
    this.policy.reportInto(reported);
  }
}
