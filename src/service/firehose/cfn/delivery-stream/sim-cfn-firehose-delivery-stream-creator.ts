import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimFirehose } from "../../sim-firehose.js";
import type { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import { simCfnFirehoseResourceCreation } from "../sim-cfn-firehose-resource-error.js";
import { firehoseDeliveryStreamResourceType } from "../sim-cfn-firehose-resource-types.js";
import { SimCfnFirehoseDeliveryStreamProperties } from "./sim-cfn-firehose-delivery-stream-properties.js";

interface SimCfnFirehoseDeliveryStreamCreatorProperties {
  readonly firehose: SimFirehose;
}

/**
 * Creates simulated delivery streams from
 * AWS::KinesisFirehose::DeliveryStream Resources.
 *
 * The delivery stream goes through the ordinary CreateDeliveryStream command
 * rather than being constructed directly, so a delivery stream a template
 * deployed is the same thing an SDK caller would have got: the same name
 * validation, the same buffering bounds, the same refusals for what this
 * simulation does not model.
 *
 * The Bucket and the Role are named by ARN, and both are resolved by the
 * CloudFormation engine before this sees them. A delivery stream deployed
 * alongside the Bucket it writes into therefore writes into that Bucket, and
 * writes as the Role the template declared.
 */
export class SimCfnFirehoseDeliveryStreamCreator {
  private readonly firehose: SimFirehose;

  constructor(properties: SimCfnFirehoseDeliveryStreamCreatorProperties) {
    this.firehose = properties.firehose;
  }

  /**
   * Create a delivery stream from an AWS::KinesisFirehose::DeliveryStream
   * Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimFirehoseDeliveryStream> {
    return await simCfnFirehoseResourceCreation(
      firehoseDeliveryStreamResourceType,
      resource.logicalId,
      async () => {
        const streamProperties = new SimCfnFirehoseDeliveryStreamProperties({
          resource,
          properties,
        });
        const input = streamProperties.createInput();

        await this.firehose.createDeliveryStream({ input });

        const deliveryStream = this.firehose.findDeliveryStream(
          streamProperties.name(),
        );
        assertDefined(
          deliveryStream,
          `sim Firehose delivery stream ${streamProperties.name()} after ` +
            `CloudFormation creation`,
        );

        return deliveryStream;
      },
    );
  }
}
