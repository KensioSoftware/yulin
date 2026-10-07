import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

const partnerPrefix = "aws.partner/";

/**
 * The characters one segment of a partner event source name may carry.
 */
const partnerSegmentPattern = /^[.\-_A-Za-z0-9]+$/;

/**
 * Real EventBridge wants the partner's own name and at least one more segment
 * after the prefix, such as `aws.partner/stripe.com/ed_test`.
 */
const minimumPartnerSegments = 2;

const maximumPartnerEventSourceNameLength = 256;

const partnerSegmentStart = partnerPrefix.length;

/**
 * Whether a string has the shape of a partner event source name.
 *
 * A partner event bus takes the name of its source, so this is also the one
 * shape of bus name that may carry a `/`.
 */
export function isPartnerEventSourceName(value: string): boolean {
  // Read segment by segment, which is the API's own pattern
  // `aws\.partner(/[\.\-_A-Za-z0-9]+){2,}` without the nested repetition.
  const segments = value.slice(partnerSegmentStart).split("/");

  return (
    value.length <= maximumPartnerEventSourceNameLength &&
    value.startsWith(partnerPrefix) &&
    segments.length >= minimumPartnerSegments &&
    segments.every((segment) => partnerSegmentPattern.test(segment))
  );
}

/**
 * The name of one partner event source.
 *
 * A SaaS partner names the source when it creates it, in the form
 * `aws.partner/<partner>/<name>`. The receiving Account never chooses the
 * name. It creates a bus under the same one.
 */
export class SimPartnerEventSourceName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read a partner event source name from request input, refusing one real
   * EventBridge would refuse.
   */
  static of(value: string, parameterName: string): SimPartnerEventSourceName {
    if (!isPartnerEventSourceName(value)) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: ${parameterName} Reason: '${value}' is not a ` +
          `partner event source name, which takes the form ` +
          `aws.partner/<partner>/<name> and is at most ` +
          `${String(maximumPartnerEventSourceNameLength)} characters long.`,
      );
    }

    return new this(value);
  }

  /**
   * The partner that created the source, which is the segment after
   * `aws.partner`.
   */
  get partner(): string {
    // The pattern guarantees a `/` after the partner segment.
    return this.value.slice(
      partnerSegmentStart,
      this.value.indexOf("/", partnerSegmentStart),
    );
  }
}
