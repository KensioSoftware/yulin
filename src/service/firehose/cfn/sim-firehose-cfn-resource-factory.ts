import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimFirehose } from "../sim-firehose.js";
import { SimCfnFirehoseDeliveryStreamCreator } from "./delivery-stream/sim-cfn-firehose-delivery-stream-creator.js";
import { SimCfnFirehoseResourceDeleter } from "./sim-cfn-firehose-resource-deleter.js";
import { firehoseDeliveryStreamResourceTypeName } from "./sim-cfn-firehose-resource-types.js";

interface SimFirehoseCfnResourceFactoryProperties {
  readonly firehose: SimFirehose;
}

/**
 * CloudFormation Resource factory for simulated Firehose resources.
 */
export class SimFirehoseCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly deliveryStreamCreator: SimCfnFirehoseDeliveryStreamCreator;
  private readonly deleter: SimCfnFirehoseResourceDeleter;

  constructor(properties: SimFirehoseCfnResourceFactoryProperties) {
    this.deliveryStreamCreator = new SimCfnFirehoseDeliveryStreamCreator({
      firehose: properties.firehose,
    });
    this.deleter = new SimCfnFirehoseResourceDeleter({
      firehose: properties.firehose,
    });
  }

  /**
   * Create a simulated Firehose resource from a CloudFormation Resource.
   *
   * The delivery stream is the one AWS::KinesisFirehose::* Resource type this
   * simulation models.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    if (resourceTypeName !== firehoseDeliveryStreamResourceTypeName) {
      throw new Error(
        `Unsupported sim Firehose CloudFormation Resource ${resourceTypeName}`,
      );
    }

    return await this.deliveryStreamCreator.create(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }

  /**
   * Delete a simulated Firehose resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    _context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource);
  }
}
