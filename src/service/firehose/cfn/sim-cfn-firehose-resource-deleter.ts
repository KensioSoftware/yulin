import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimFirehose } from "../sim-firehose.js";
import type { SimFirehoseDeliveryStream } from "../stream/sim-firehose-delivery-stream.js";
import { firehoseDeliveryStreamResourceTypeName } from "./sim-cfn-firehose-resource-types.js";

interface SimCfnFirehoseResourceDeleterProperties {
  readonly firehose: SimFirehose;
}

/**
 * Deletes the simulated Firehose resources a CloudFormation Stack created.
 */
export class SimCfnFirehoseResourceDeleter {
  private readonly firehose: SimFirehose;

  constructor(properties: SimCfnFirehoseResourceDeleterProperties) {
    this.firehose = properties.firehose;
  }

  /**
   * Delete a simulated Firehose resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    if (resourceTypeName !== firehoseDeliveryStreamResourceTypeName) {
      throw new Error(
        `Unsupported sim Firehose CloudFormation Resource ${resourceTypeName} deletion`,
      );
    }

    const deliveryStream = resource.simResource as
      | SimFirehoseDeliveryStream
      | undefined;
    assertDefined(
      deliveryStream,
      `sim Firehose delivery stream for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.firehose.deleteDeliveryStream({
      input: { DeliveryStreamName: deliveryStream.name },
    });
  }
}
