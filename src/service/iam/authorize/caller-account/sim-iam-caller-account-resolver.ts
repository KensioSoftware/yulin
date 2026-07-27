import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamAccountResolver } from "../../registry/sim-iam-account-resolver.js";
import type { SimIamCallerAccount } from "./sim-iam-caller-account.js";
import { SimIamCrossAccountCaller } from "./sim-iam-cross-account-caller.js";
import { SimIamSameAccountCaller } from "./sim-iam-same-account-caller.js";

interface SimIamCallerAccountResolverProperties {
  /**
   * The Account evaluating the request, which owns the target resource.
   */
  readonly accountId: SimAwsAccountId;

  /**
   * Resolves the IAM state of other Accounts in the same simulation.
   *
   * A standalone SimIam has no wider simulation to look in, so it has no
   * resolver and no other Account's identity policies to find.
   */
  readonly iamResolver?: SimIamAccountResolver | undefined;
}

/**
 * Works out which Account owns the caller of an authorization request.
 *
 * The answer decides how the request is evaluated, so it is made once, here,
 * from the resolved caller. A caller with no Account in its ARN — a service
 * principal or an anonymous request — has no identity side and is treated as
 * belonging to the evaluating Account, which leaves it to be allowed by a
 * resource policy alone.
 */
export class SimIamCallerAccountResolver {
  private readonly accountId: SimAwsAccountId;
  private readonly iamResolver?: SimIamAccountResolver | undefined;

  constructor(properties: SimIamCallerAccountResolverProperties) {
    this.accountId = properties.accountId;
    this.iamResolver = properties.iamResolver;
  }

  /**
   * Resolve the caller's Account relative to the Account owning the resource.
   */
  resolve(caller: SimAwsResolvedCaller): SimIamCallerAccount {
    const callerAccountId = caller.accountId;

    if (callerAccountId === undefined || callerAccountId === this.accountId) {
      return new SimIamSameAccountCaller();
    }

    return new SimIamCrossAccountCaller({
      principal: caller.identityPolicyPrincipal,
      callerAccountIam: this.iamResolver?.findIamForAccount(
        callerAccountId as SimAwsAccountId,
      ),
    });
  }
}
