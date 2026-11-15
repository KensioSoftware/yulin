import { SimAwsResourceTags } from "../../aws/tag/sim-aws-resource-tags.js";
import {
  SimSsmTooManyTagsError,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";

/**
 * The characters the SSM `Tag` type allows in a key or value. Those are
 * Unicode letters, separators and digits, and `_ . : / = + - @`.
 */
const tagCharacters = /^[\p{L}\p{Z}\p{N}_.:\/=+\-@]*$/v;

/**
 * An empty set of tags for one parameter, which holds at most 50.
 */
export function simSsmParameterTags(): SimAwsResourceTags {
  return new SimAwsResourceTags({
    greatest: 50,
    characters: tagCharacters,
    invalid: (message) => new SimSsmValidationException(message),
    tooMany: (message) => new SimSsmTooManyTagsError(message),
  });
}
