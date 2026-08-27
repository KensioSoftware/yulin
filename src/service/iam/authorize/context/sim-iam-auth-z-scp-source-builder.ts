import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { isSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamServiceControlPolicyResolver } from "../scp/sim-iam-scp-resolver.js";
import type { SimIamAuthZPolicySource } from "./sim-iam-auth-z-context.js";

interface SimIamAuthZScpSourceBuilderProperties {
  /**
   * The Account whose IAM is evaluating the request.
   */
  readonly accountId: SimAwsAccountId;

  readonly scpResolver?: SimIamServiceControlPolicyResolver | undefined;
}

/**
 * Finds the service control policies that apply to one request.
 *
 * An SCP belongs to the caller's own Account, which is the Account whose
 * principal is asking. For a request within one Account that is the Account
 * evaluating it. For a cross-Account request it is the other one, because AWS
 * filters a principal by the organization its own account sits in and leaves
 * the resource's organization to say nothing about it.
 *
 * A caller with no Account in its ARN, which means a service principal or an
 * anonymous request, belongs to no Account and is subject to no SCP.
 */
export class SimIamAuthZScpSourceBuilder {
  private readonly accountId: SimAwsAccountId;
  private readonly scpResolver?: SimIamServiceControlPolicyResolver | undefined;

  constructor(properties: SimIamAuthZScpSourceBuilderProperties) {
    this.accountId = properties.accountId;
    this.scpResolver = properties.scpResolver;
  }

  /**
   * The service control policy sources in force for a resolved caller.
   */
  build(caller: SimAwsResolvedCaller): readonly SimIamAuthZPolicySource[] {
    const scpResolver = this.scpResolver;

    if (scpResolver === undefined) {
      return [];
    }

    const accountId = this.callerAccountId(caller);

    if (accountId === undefined) {
      return [];
    }

    return scpResolver.serviceControlPoliciesFor(accountId).map((policy) => ({
      sourceType: "service-control" as const,
      document: policy.document,
      policyName: policy.policyName,
    }));
  }

  /**
   * The Account whose organization decides this request.
   *
   * A caller identified only by a service name or by nothing at all has no
   * Account of its own. The Account root fallback IAM applies to a request
   * with no caller carries this Account's id, so a CloudFormation deployment
   * is filtered like any other principal in it.
   */
  private callerAccountId(
    caller: SimAwsResolvedCaller,
  ): SimAwsAccountId | undefined {
    if (caller.principal.kind === "anonymous" || caller.service !== undefined) {
      return undefined;
    }

    const callerAccountId = caller.accountId;

    if (callerAccountId === undefined) {
      return this.accountId;
    }

    return isSimAwsAccountId(callerAccountId) ? callerAccountId : undefined;
  }
}
