import { jsonParse } from "../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimIamPolicyDocumentValidator } from "../../iam/validate/sim-iam-policy-document-validator.js";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

const policyValidator: SimIamPolicyDocumentValidator =
  new SimIamPolicyDocumentValidator();

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
 * Read a topic policy attribute value as the IAM policy document it has to be.
 *
 * The document goes through sim IAM's own policy document validator, so a topic
 * policy is held to the same rules as any other policy document, and it is held
 * to them when the attribute is set rather than when the policy is first
 * evaluated.
 */
function parsedDocument(value: string): SimIamPolicyDocument {
  try {
    policyValidator.validateRequired(value);

    return jsonParse(value);
  } catch (error) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: Policy Error: ${reasonFor(error)}`,
    );
  }
}

interface SimSnsTopicPolicyProperties {
  readonly value: string;
  readonly document: SimIamPolicyDocument;
}

/**
 * The resource policy of one simulated topic.
 *
 * It is what admits a caller with no identity policy of its own: another
 * Account's principal, or a service principal such as `s3.amazonaws.com`, which
 * owns no identity policies anywhere. Sim IAM evaluates it as the topic's
 * resource policy, so the rules about who it lets in are IAM's rather than
 * SNS's.
 *
 * The string the policy was set with is kept, so `GetTopicAttributes` reports
 * back what was set rather than a re-serialised version of it.
 */
export class SimSnsTopicPolicy {
  public readonly value: string;
  public readonly document: SimIamPolicyDocument;

  private constructor(properties: SimSnsTopicPolicyProperties) {
    this.value = properties.value;
    this.document = properties.document;
  }

  /**
   * Read a topic policy attribute value, refusing one real SNS would refuse.
   */
  static parse(value: string): SimSnsTopicPolicy {
    return new this({ value, document: parsedDocument(value) });
  }
}
