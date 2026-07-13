import type { SimIamAuthorizationInput } from "./context/sim-iam-auth-z-context-builder.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import { SimAwsCallerResolver } from "../../aws/caller/sim-aws-caller-resolver.js";

/**
 * The part of an IAM authorization decision needed by service integrations.
 *
 * Service command handlers need to know whether authorization succeeded and
 * which caller should appear in an access-denied error. They do not need the
 * policy evaluation details exposed by SimIamPolicyDecision.
 *
 * SimIamPolicyDecision structurally implements this interface, while simpler
 * authorization implementations can return a decision without invoking the IAM
 * policy parser and matcher.
 */
export interface SimIamAuthorizationDecision {
  readonly caller: SimAwsResolvedCaller;
  readonly isAllowed: boolean;
  readonly isDenied: boolean;
}

/**
 * IAM authorization capability consumed by other simulated AWS services.
 *
 * SimIam structurally implements this interface without requiring consumers to
 * depend on the complete IAM service facade or its concrete decision type.
 */
export interface SimIamInterServiceAuthZ {
  authorize(input: SimIamAuthorizationInput): SimIamAuthorizationDecision;
}

/**
 * Permissive authorization used when a service is constructed without IAM.
 *
 * Top-level SimAws service construction supplies the account-scoped SimIam
 * implementation, so requests made through SimAws still evaluate simulated IAM
 * policies. This fallback supports direct construction of service facades and
 * command handlers without creating isolated IAM state.
 *
 * This implementation does not create synthetic policies or use the IAM policy
 * evaluator. Its result therefore remains allowed if IAM later adds principal-
 * specific rules, permission boundaries, service control policies, or other
 * sources of explicit denial.
 */
export class SimIamAllowAllAuth implements SimIamInterServiceAuthZ {
  private readonly callerResolver = new SimAwsCallerResolver();

  /**
   * Return an unconditional allowed decision.
   *
   * Caller resolution is retained only for consistent diagnostic metadata. An
   * omitted caller is represented as anonymous because this adapter has no
   * Account from which to derive a root ARN. That representation cannot affect
   * the result because no policies or principal rules are evaluated here.
   */
  authorize(input: SimIamAuthorizationInput): SimIamAuthorizationDecision {
    const caller =
      input.caller?.kind === "credentials"
        ? this.callerResolver.resolve(
            { kind: "anonymous" },
            { kind: "anonymous" },
          )
        : this.callerResolver.resolve(input.caller, {
            kind: "anonymous",
          });

    return {
      caller,
      isAllowed: true,
      isDenied: false,
    };
  }
}
