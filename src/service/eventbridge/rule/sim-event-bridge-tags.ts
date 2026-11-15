import { SimAwsResourceTags } from "../../aws/tag/sim-aws-resource-tags.js";
import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

/**
 * An empty set of tags for one rule or event bus, which holds at most 50.
 *
 * The EventBridge API reference documents no error of its own for a request
 * over the limit, so it is refused as a validation error, as a malformed tag
 * is.
 */
export function simEventBridgeTags(): SimAwsResourceTags {
  return new SimAwsResourceTags({
    greatest: 50,
    invalid: (message) => new SimEventBridgeValidationException(message),
    tooMany: (message) => new SimEventBridgeValidationException(message),
  });
}
