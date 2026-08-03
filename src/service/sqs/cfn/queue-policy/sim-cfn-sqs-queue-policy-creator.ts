import { assertDefined } from "../../../../util/type-guard/defined.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import { simSqsQueuePolicyAttributeName } from "../../queue/sim-sqs-queue-attribute-specs.js";
import { SimSqsQueueUrl } from "../../queue/sim-sqs-queue-url.js";
import type { SimSqs } from "../../sim-sqs.js";

interface SimCfnSqsQueuePolicyCreatorProperties {
  readonly sqs: SimSqs;
}

/**
 * Creates simulated queue policies from AWS::SQS::QueuePolicy Resources.
 *
 * This is what CDK emits for `grantSendMessages` to a service principal and for
 * every `addToResourcePolicy`, so a synthesized template reaches it whether or
 * not the app mentions a queue policy itself. The policy is set through the
 * ordinary SetQueueAttributes command, so one declared in a template is
 * validated and enforced exactly as one set through the SDK.
 */
export class SimCfnSqsQueuePolicyCreator {
  private readonly sqs: SimSqs;

  constructor(properties: SimCfnSqsQueuePolicyCreatorProperties) {
    this.sqs = properties.sqs;
  }

  /**
   * Attach a policy to each queue the Resource names.
   *
   * The first queue is returned as the Resource's simulated object, because a
   * queue policy has no existence of its own in SQS: it is the `Policy`
   * attribute of the queues it names.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimSqsQueue> {
    const queueUrls = this.queueUrlsForResource(resource, properties);
    const policy = jsonStringify(
      this.policyDocumentForResource(resource, properties),
    );

    const queues = await Promise.all(
      queueUrls.map(async (queueUrl) => this.policyApplied(queueUrl, policy)),
    );

    const first = queues[0];
    assertDefined(
      first,
      `sim SQS queue after CloudFormation queue policy creation for ${resource.logicalId}`,
    );

    return first;
  }

  /**
   * Set the policy on one queue and hand back the queue it was set on.
   */
  private async policyApplied(
    queueUrl: string,
    policy: string,
  ): Promise<SimSqsQueue> {
    await this.sqs.setQueueAttributes({
      input: {
        QueueUrl: queueUrl,
        Attributes: { [simSqsQueuePolicyAttributeName]: policy },
      },
    });

    const parts = SimSqsQueueUrl.parse(queueUrl);
    assertDefined(parts, `queue URL ${queueUrl} SetQueueAttributes accepted`);

    const queue = this.sqs.findQueue(parts.name);
    assertDefined(queue, `sim SQS queue at ${queueUrl}`);

    return queue;
  }

  /**
   * The queue URLs the Resource names.
   *
   * `Ref` on an AWS::SQS::Queue gives its URL, so a template naming its queues
   * the way CDK does arrives here as the URLs SetQueueAttributes takes.
   */
  private queueUrlsForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly string[] {
    const queues = properties["Queues"];

    if (!Array.isArray(queues) || queues.length === 0) {
      throw new TypeError(
        `AWS::SQS::QueuePolicy ${resource.logicalId} requires a Queues list of queue URLs`,
      );
    }

    return queues.map((queue) => {
      if (typeof queue !== "string") {
        throw new TypeError(
          `AWS::SQS::QueuePolicy ${resource.logicalId} requires each entry of Queues to be a queue URL string, got ${typeof queue}`,
        );
      }

      return queue;
    });
  }

  private policyDocumentForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): object {
    const policyDocument = properties["PolicyDocument"];

    if (
      policyDocument === undefined ||
      policyDocument === null ||
      typeof policyDocument !== "object" ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `AWS::SQS::QueuePolicy ${resource.logicalId} requires a PolicyDocument object`,
      );
    }

    return policyDocument;
  }
}
