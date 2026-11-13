import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { simStsCallerUserId } from "../../sts/command/get-caller-identity/sim-sts-caller-user-id.js";
import type { SimIamServiceControlPolicyResolver } from "../authorize/scp/sim-iam-scp-resolver.js";
import type { SimIamAccountResolver } from "../registry/sim-iam-account-resolver.js";
import type { SimAwsRequestCallerDetails } from "./sim-aws-request-caller.js";

/**
 * Where the details of a caller are looked up. Either can be missing, and the
 * detail it would have given is then missing too.
 */
export interface SimAwsRequestCallerDirectory {
  readonly iam?: SimIamAccountResolver | undefined;
  readonly organizations?:
    | Pick<SimIamServiceControlPolicyResolver, "organizationIdFor">
    | undefined;
}

/**
 * What simulated AWS knows about a principal beyond its ARN.
 *
 * The unique id is the one STS reports for the same caller, and the
 * organization is the one its Account sits in. A principal with no record
 * behind it gets neither, so the event reports what it would for a caller
 * nothing is known about.
 */
export function simAwsRequestCallerDetails(
  identity: {
    readonly principal: SimAwsPrincipal;
    readonly accessKeyId?: string | undefined;
  },
  directory: SimAwsRequestCallerDirectory,
): SimAwsRequestCallerDetails {
  const { principal, accessKeyId } = identity;
  const accountId =
    principal.kind === "arn" ? principal.arn.split(":", 6)[4] : undefined;

  if (accountId === undefined || accountId === "" || principal.kind !== "arn") {
    return { accessKeyId };
  }

  const { UserId: userId } =
    directory.iam === undefined
      ? {}
      : simStsCallerUserId(
          principal.arn,
          accountId as SimAwsAccountId,
          directory.iam,
        );

  return {
    accessKeyId,
    userId,
    principalOrgId: directory.organizations?.organizationIdFor?.(
      accountId as SimAwsAccountId,
    ),
  };
}
