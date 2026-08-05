import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSqs } from "../sim-sqs.js";
import type { SimSqsQueue } from "../queue/sim-sqs-queue.js";
import { simSqsQueuePolicyAttributeName } from "../queue/sim-sqs-queue-attribute-specs.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnSqsResourceDeleterProperties {
  readonly sqs: SimSqs;
}

/**
 * Deletes the simulated SQS resources a CloudFormation Stack created.
 *
 * There is no DeleteQueuePolicy in SQS. A queue policy is the `Policy`
 * attribute of the queues it names, so removing one is SetQueueAttributes
 * setting that attribute to an empty string, which is how the SDK clears it
 * too.
 */
export class SimCfnSqsResourceDeleter {
  private readonly sqs: SimSqs;

  constructor(properties: SimCfnSqsResourceDeleterProperties) {
    this.sqs = properties.sqs;
  }

  /**
   * Delete a simulated SQS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Queue": {
        await this.deleteQueue(resource);
        return;
      }
      case "QueuePolicy": {
        await this.clearQueuePolicy(properties);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim SQS CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteQueue(resource: SimCfnResource): Promise<void> {
    const queue = resource.simResource as SimSqsQueue | undefined;
    assertDefined(
      queue,
      `sim SQS queue for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.sqs.deleteQueue({ input: { QueueUrl: queue.url } });
  }

  /**
   * Take the policy back off every queue the Resource named.
   *
   * The Resource points at only the first of them, so the queues are read from
   * the template the same way creation read them.
   */
  private async clearQueuePolicy(
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const queues = properties["Queues"];

    /* v8 ignore if -- creation refused the Resource without a Queues list */
    if (!Array.isArray(queues)) {
      return;
    }

    await Promise.all(
      queues
        .filter((queueUrl): queueUrl is string => typeof queueUrl === "string")
        .map(async (queueUrl) =>
          this.sqs.setQueueAttributes({
            input: {
              QueueUrl: queueUrl,
              Attributes: { [simSqsQueuePolicyAttributeName]: "" },
            },
          }),
        ),
    );
  }
}
