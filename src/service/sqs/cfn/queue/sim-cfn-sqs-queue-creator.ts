import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSqs } from "../../sim-sqs.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import { SimCfnSqsQueueProperties } from "./sim-cfn-sqs-queue-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSqsQueueCreatorProperties {
  readonly sqs: SimSqs;
}

/**
 * Creates simulated queues from AWS::SQS::Queue Resources.
 *
 * The queue is created through the ordinary CreateQueue command rather than
 * constructed directly, so a queue a template deployed is the same thing an SDK
 * caller would have got: the same name validation, the same attribute ranges,
 * the same refusals for what this simulation does not model.
 */
export class SimCfnSqsQueueCreator {
  private readonly sqs: SimSqs;

  constructor(properties: SimCfnSqsQueueCreatorProperties) {
    this.sqs = properties.sqs;
  }

  /**
   * Create a queue from an AWS::SQS::Queue Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimSqsQueue> {
    const queueProperties = new SimCfnSqsQueueProperties({
      resource,
      properties,
    });
    const name = queueProperties.name();

    await this.sqs.createQueue(
      { input: { QueueName: name, Attributes: queueProperties.attributes() } },
      options,
    );

    const queue = this.sqs.findQueue(name);
    assertDefined(queue, `sim SQS queue ${name} after CloudFormation creation`);

    return queue;
  }
}
