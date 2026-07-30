import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSqs } from "../sim-sqs.js";
import { SimCfnSqsQueueCreator } from "./queue/sim-cfn-sqs-queue-creator.js";

interface SimSqsCfnResourceFactoryProperties {
  readonly sqs: SimSqs;
}

/**
 * CloudFormation Resource factory for simulated SQS resources.
 */
export class SimSqsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly queueCreator: SimCfnSqsQueueCreator;

  constructor(properties: SimSqsCfnResourceFactoryProperties) {
    this.queueCreator = new SimCfnSqsQueueCreator({ sqs: properties.sqs });
  }

  /**
   * Create a simulated SQS resource from a CloudFormation Resource.
   *
   * The queue is the only AWS::SQS::* Resource type this simulation models. A
   * queue policy grants cross-account access, which is not simulated, so
   * AWS::SQS::QueuePolicy is reported as unsupported and skipped rather than
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
      default: {
        throw new Error(
          `Unsupported sim SQS CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
