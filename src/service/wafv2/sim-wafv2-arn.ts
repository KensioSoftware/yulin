import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { type SimWafScope, simWafScopePath } from "./scope/sim-waf-scope.js";

/**
 * The three WAFv2 resource types this simulation holds, spelled as their ARNs
 * spell them.
 */
export type SimWafResourceKind = "webacl" | "ipset" | "regexpatternset";

/**
 * The start of every WAFv2 ARN in one account, region and scope.
 */
export function simWafArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
  scope: SimWafScope,
): string {
  return (
    `arn:aws:wafv2:${accountRegionScope.regionName}:` +
    `${accountRegionScope.accountId}:${simWafScopePath(scope)}/`
  );
}

/**
 * The ARN of one WAFv2 resource.
 *
 * The id is part of the name, which is why every read takes both: two web ACLs
 * created under the same name at different times are different resources, and
 * only the id tells them apart.
 */
export function simWafArn(properties: {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly scope: SimWafScope;
  readonly kind: SimWafResourceKind;
  readonly name: string;
  readonly id: string;
}): string {
  const { accountRegionScope, scope, kind, name, id } = properties;

  return `${simWafArnPrefix(accountRegionScope, scope)}${kind}/${name}/${id}`;
}
