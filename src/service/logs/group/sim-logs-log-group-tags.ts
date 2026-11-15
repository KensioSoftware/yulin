import { SimAwsResourceTags } from "../../aws/tag/sim-aws-resource-tags.js";
import {
  SimLogsInvalidParameterException,
  SimLogsTooManyTagsException,
} from "../error/sim-logs.error.js";

/**
 * The characters the CloudWatch Logs tag commands allow in a key or value.
 * Those are Unicode letters, separators and digits, and `_ . : / = + - @`.
 */
const tagCharacters = /^[\p{L}\p{Z}\p{N}_.:\/=+\-@]*$/v;

/**
 * An empty set of tags for one log group, which holds at most 50.
 */
export function simLogsLogGroupTags(): SimAwsResourceTags {
  return new SimAwsResourceTags({
    greatest: 50,
    characters: tagCharacters,
    invalid: (message) => new SimLogsInvalidParameterException(message),
    tooMany: (message) => new SimLogsTooManyTagsException(message),
  });
}
