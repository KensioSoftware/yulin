import type { SimSqsQueue } from "../../../../sqs/queue/sim-sqs-queue.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSqsQueueCfnProperties {
  readonly queue: SimSqsQueue;
}

/**
 * CloudFormation-facing values for a simulated SQS queue.
 */
export class SimSqsQueueCfn implements SimCfnResourceValueAdapter {
  private readonly queue: SimSqsQueue;

  constructor(properties: SimSqsQueueCfnProperties) {
    this.queue = properties.queue;
  }

  /**
   * AWS::SQS::Queue Ref returns the queue URL rather than its name or ARN,
   * which is what makes a Ref usable as a SendMessage QueueUrl.
   */
  refValue(): SimCfnTemplateValue {
    return this.queue.url;
  }

  /**
   * AWS::SQS::Queue attributes.
   *
   * The ARN is what an IAM policy names the queue by, and the name is what
   * GetQueueUrl takes, so a template can reach the queue whichever of the three
   * the thing using it needs.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.queue.arn.value;
      }
      case "QueueName": {
        return this.queue.name.value;
      }
      case "QueueUrl": {
        return this.queue.url;
      }
      default: {
        throw new Error(
          `Unsupported AWS::SQS::Queue attribute ${attributeName}`,
        );
      }
    }
  }
}
