import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOperation } from "../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";
import {
  iamQueryListingInput,
  iamQueryListingResult,
} from "./sim-iam-query-listing.js";

type SimIamQueryInput = (fields: SimQueryFields) => Record<string, unknown>;

/**
 * Read the named members of a request, each as text.
 */
export function iamQueryText(...names: readonly string[]): SimIamQueryInput {
  return (fields) =>
    Object.fromEntries(names.map((name) => [name, fields.text(name)]));
}

/**
 * Read the named text members of a listing request, and its paging.
 */
export function iamQueryListing(...names: readonly string[]): SimIamQueryInput {
  return (fields) => ({
    ...iamQueryListingInput(fields),
    ...iamQueryText(...names)(fields),
  });
}

/**
 * An operation answering with nothing but its request ID, as every IAM
 * operation that only changes something does.
 */
export function iamQueryAction(input: SimIamQueryInput): SimQueryOperation {
  return { input, result: (): string => "" };
}

/**
 * Write a listing answer of structures, and its paging.
 */
export function iamQueryListResult(
  name: string,
  members: readonly string[],
): (output: SimQueryOutput) => string {
  return (output) =>
    queryList(output, name, (item) => queryMembers(item, members)) +
    iamQueryListingResult(output);
}
