import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { SimCreatePolicyCommand } from "./create-policy.command.js";
import type { SimIamPolicyName } from "../../../policy/sim-iam-policy.js";
import { makeSimPolicyArn } from "../../../policy/sim-iam-policy-arn.js";
import { normalisePolicyPath } from "../../../policy/sim-iam-policy-path.js";
import { SimIamPolicyDocumentValidator } from "../../../validate/sim-iam-policy-document-validator.js";

/**
 * The validated identity of a policy about to be created, derived from the
 * raw CreatePolicy command input.
 */
export interface ResolvedCreatePolicyInput {
  readonly policyName: SimIamPolicyName;
  readonly path: string;
  readonly arn: SimArn;
}

/**
 * Validates CreatePolicy command input and resolves it into the policy's
 * identity (name, normalised path, and ARN).
 *
 * The handler owns orchestration (sequencing, duplicate checks, persistence);
 * this resolver owns the up-front "is this input usable, and what ARN does it
 * map to" concern. Keeping name validation, document validation, path
 * normalisation, and ARN construction together here keeps those input rules in
 * one place and off the handler's critical path.
 */
export class CreatePolicyInputResolver {
  private readonly policyDocValidator: SimIamPolicyDocumentValidator =
    new SimIamPolicyDocumentValidator();

  constructor(private readonly accountId: SimAwsAccountId) {}

  /**
   * Validate the command input and resolve the policy's name, normalised
   * path, and ARN.
   */
  resolve(command: SimCreatePolicyCommand): ResolvedCreatePolicyInput {
    const policyName = command.input.PolicyName as SimIamPolicyName | undefined;

    if (policyName === undefined || policyName.length === 0) {
      throw new Error("PolicyName is required");
    }

    this.policyDocValidator.validateOptional(command.input.PolicyDocument);

    const path = normalisePolicyPath(command.input.Path);
    const arn = makeSimPolicyArn({
      accountId: this.accountId,
      path,
      policyName,
    });

    return { policyName, path, arn };
  }
}
