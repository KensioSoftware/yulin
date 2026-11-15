import { SimAwsResourceTags } from "../../aws/tag/sim-aws-resource-tags.js";
import {
  SimKmsLimitExceededException,
  SimKmsTagException,
} from "../error/sim-kms.error.js";

/**
 * An empty set of tags for one key, which holds at most 50.
 */
export function simKmsKeyTags(): SimAwsResourceTags {
  return new SimAwsResourceTags({
    greatest: 50,
    invalid: (message) => new SimKmsTagException(message),
    tooMany: (message) => new SimKmsLimitExceededException(message),
  });
}

/**
 * One tag as a KMS request carries it, which names its parts differently
 * from most AWS APIs.
 */
export interface SimKmsTag {
  readonly TagKey?: string | undefined;
  readonly TagValue?: string | undefined;
}
