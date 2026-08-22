import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { SimFirehoseDeliveryStream } from "../../../../firehose/stream/sim-firehose-delivery-stream.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing values for a simulated Firehose delivery stream.
 */
export class SimFirehoseDeliveryStreamCfn implements SimCfnResourceValueAdapter {
  readonly #deliveryStream: SimFirehoseDeliveryStream;

  constructor(deliveryStream: SimFirehoseDeliveryStream) {
    this.#deliveryStream = deliveryStream;
  }

  /**
   * A Ref to an AWS::KinesisFirehose::DeliveryStream returns the delivery
   * stream name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#deliveryStream.name;
  }

  /**
   * The one attribute the Resource publishes, which is the delivery stream ARN.
   *
   * That is what a grant names, so a template allowing a producer to put
   * records reads it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const value =
      attributeName === "Arn" ? this.#deliveryStream.arn : undefined;

    assertDefined(
      value,
      `Unsupported AWS::KinesisFirehose::DeliveryStream attribute ${attributeName}`,
    );

    return value;
  }
}
