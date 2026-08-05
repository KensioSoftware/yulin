import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSqs } from "../sim-sqs.js";
import { SimCfnSqsQueueCreator } from "./queue/sim-cfn-sqs-queue-creator.js";
import { SimCfnSqsQueuePolicyCreator } from "./queue-policy/sim-cfn-sqs-queue-policy-creator.js";
import { SimCfnSqsResourceDeleter } from "./sim-cfn-sqs-resource-deleter.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";

interface SimSqsCfnResourceFactoryProperties {
  readonly sqs: SimSqs;
}

/**
 * CloudFormation Resource factory for simulated SQS resources.
 */
export class SimSqsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly queueCreator: SimCfnSqsQueueCreator;
  private readonly queuePolicyCreator: SimCfnSqsQueuePolicyCreator;
  private readonly deleter: SimCfnSqsResourceDeleter;

  constructor(properties: SimSqsCfnResourceFactoryProperties) {
    this.queueCreator = new SimCfnSqsQueueCreator({ sqs: properties.sqs });
    this.queuePolicyCreator = new SimCfnSqsQueuePolicyCreator({
      sqs: properties.sqs,
    });
    this.deleter = new SimCfnSqsResourceDeleter({ sqs: properties.sqs });
  }

  /**
   * Create a simulated SQS resource from a CloudFormation Resource.
   *
   * The queue and its policy are the AWS::SQS::* Resource types this simulation
   * models. Anything else is reported as unsupported and skipped rather than
   * quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Queue": {
        return await this.queueCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "QueuePolicy": {
        return await this.queuePolicyCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim SQS CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated SQS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }
}
