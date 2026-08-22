import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimKinesis } from "../sim-kinesis.js";
import { SimCfnKinesisResourceDeleter } from "./sim-cfn-kinesis-resource-deleter.js";
import { SimCfnKinesisStreamCreator } from "./stream/sim-cfn-kinesis-stream-creator.js";

interface SimKinesisCfnResourceFactoryProperties {
  readonly kinesis: SimKinesis;
}

/**
 * CloudFormation Resource factory for simulated Kinesis resources.
 */
export class SimKinesisCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly streamCreator: SimCfnKinesisStreamCreator;
  private readonly deleter: SimCfnKinesisResourceDeleter;

  constructor(properties: SimKinesisCfnResourceFactoryProperties) {
    this.streamCreator = new SimCfnKinesisStreamCreator({
      kinesis: properties.kinesis,
    });
    this.deleter = new SimCfnKinesisResourceDeleter({
      kinesis: properties.kinesis,
    });
  }

  /**
   * Create a simulated Kinesis resource from a CloudFormation Resource.
   *
   * The stream is the one AWS::Kinesis::* Resource type this simulation models.
   * `StreamConsumer` registers an enhanced fan-out consumer and `ResourcePolicy`
   * admits a caller from another Account, and neither has anything to act on
   * here, so both are reported as unsupported and skipped rather than quietly
   * treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    if (resourceTypeName !== "Stream") {
      throw new Error(
        `Unsupported sim Kinesis CloudFormation Resource ${resourceTypeName}`,
      );
    }

    return await this.streamCreator.create(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }

  /**
   * Delete a simulated Kinesis resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    _context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource);
  }
}
