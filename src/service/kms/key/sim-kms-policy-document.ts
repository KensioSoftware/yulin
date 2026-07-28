import { SimKmsValidationException } from "../error/sim-kms.error.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";

/**
 * Reads a key policy from the JSON string the real KMS API takes.
 *
 * CreateKey and PutKeyPolicy both take the policy this way, so parsing it, and
 * refusing it in the same terms when it is not a policy document, belongs in
 * one place.
 */
export class SimKmsPolicyDocument {
  /**
   * Parse a policy, or refuse if it is not valid JSON.
   *
   * A document object is accepted too, because writing one inline is the
   * obvious thing to do from a test and stringifying it adds nothing.
   */
  parse(policy: string | SimIamPolicyDocument): SimIamPolicyDocument {
    if (typeof policy !== "string") {
      return policy;
    }

    return this.requireDocument(this.parsed(policy));
  }

  /**
   * Parse an optional policy, leaving it undefined when none was given.
   */
  parseOptional(policy: string | undefined): SimIamPolicyDocument | undefined {
    if (policy === undefined) {
      return undefined;
    }

    return this.parse(policy);
  }

  /**
   * A policy has to be a JSON object. `null`, an array and a bare scalar are
   * all valid JSON and none of them is a policy document, so refusing them
   * here reports the problem where it was made rather than at the point some
   * later authorization tries to evaluate them.
   */
  private requireDocument(parsed: unknown): SimIamPolicyDocument {
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new SimKmsValidationException(
        "Policy is not a valid JSON policy document",
      );
    }

    return parsed;
  }

  private parsed(policy: string): unknown {
    try {
      return JSON.parse(policy);
    } catch {
      throw new SimKmsValidationException(
        "Policy is not a valid JSON policy document",
      );
    }
  }
}
