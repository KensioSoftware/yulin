import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { SimKinesisStream } from "../../../../kinesis/stream/sim-kinesis-stream.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing values for a simulated Kinesis stream.
 */
export class SimKinesisStreamCfn implements SimCfnResourceValueAdapter {
  readonly #stream: SimKinesisStream;

  constructor(stream: SimKinesisStream) {
    this.#stream = stream;
  }

  /**
   * A Ref to an AWS::Kinesis::Stream returns the stream name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#stream.name;
  }

  /**
   * The one attribute the Resource publishes, which is the stream ARN.
   *
   * That is what every Kinesis API and every grant names, so a template wiring
   * a stream into a Lambda event source mapping or an IAM policy reads it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const value = attributeName === "Arn" ? this.#stream.arn : undefined;

    assertDefined(
      value,
      `Unsupported AWS::Kinesis::Stream attribute ${attributeName}`,
    );

    return value;
  }
}
