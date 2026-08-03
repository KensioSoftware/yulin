import { jsonParse, jsonStringify } from "../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimIamPolicyDocumentValidator } from "../../iam/validate/sim-iam-policy-document-validator.js";
import { SimSqsInvalidAttributeValue } from "../error/sim-sqs.error.js";
import { simSqsQueuePolicyAttributeName } from "./sim-sqs-queue-attribute-specs.js";

const policyValidator: SimIamPolicyDocumentValidator =
  new SimIamPolicyDocumentValidator();

/**
 * The error real SQS refuses a queue policy with.
 *
 * A queue policy is one of the queue's attributes, so a policy it will not take
 * is an invalid attribute value rather than a malformed policy document.
 */
function invalidPolicy(value: string, reason: string): Error {
  return new SimSqsInvalidAttributeValue(
    `Value ${value} for parameter ${simSqsQueuePolicyAttributeName} is ` +
      `invalid. Reason: ${reason}.`,
  );
}

/**
 * What a rejected policy document was rejected for.
 */
function reasonFor(error: unknown): string {
  /* v8 ignore next 3 -- unreachable: JSON parsing and policy validation both
     throw Errors, so nothing else reaches this. */
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.message;
}

/**
 * Read a queue policy attribute value as the IAM policy document it has to be.
 *
 * The document goes through sim IAM's own policy document validator, so a queue
 * policy is held to the same rules as any other policy document, and it is held
 * to them when the attribute is set rather than when the policy is first
 * evaluated.
 */
function parsedDocument(value: string): SimIamPolicyDocument {
  try {
    policyValidator.validateRequired(value);

    return jsonParse(value);
  } catch (error) {
    throw invalidPolicy(value, reasonFor(error));
  }
}

interface SimSqsQueuePolicyProperties {
  readonly value: string;
  readonly document: SimIamPolicyDocument;
}

/**
 * The resource policy of one simulated queue.
 *
 * It is what admits a caller with no identity policy of its own: another
 * Account's principal, or a service principal such as `s3.amazonaws.com`, which
 * owns no identity policies anywhere. Sim IAM evaluates it as the queue's
 * resource policy, so the rules about who it lets in are IAM's rather than SQS's.
 *
 * The string the policy was set with is kept, so `GetQueueAttributes` reports
 * back what was set rather than a re-serialised version of it.
 */
export class SimSqsQueuePolicy {
  public readonly value: string;
  public readonly document: SimIamPolicyDocument;

  private constructor(properties: SimSqsQueuePolicyProperties) {
    this.value = properties.value;
    this.document = properties.document;
  }

  /**
   * Read a queue policy attribute value, refusing one real SQS would refuse.
   */
  static parse(value: string): SimSqsQueuePolicy {
    return new this({ value, document: parsedDocument(value) });
  }

  /**
   * Whether another policy says the same thing, which is the question a
   * repeated `CreateQueue` asks.
   *
   * The parsed documents are compared rather than the strings they were set
   * with, so the same policy written out with different whitespace is the same
   * policy. Written out with its keys in a different order it is not, which is
   * stricter than AWS and is the safe direction for an idempotency check.
   */
  matches(other: SimSqsQueuePolicy): boolean {
    return this.serialized() === other.serialized();
  }

  private serialized(): string {
    return jsonStringify(this.document);
  }
}
