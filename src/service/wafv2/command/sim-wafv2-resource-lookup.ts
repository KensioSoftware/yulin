import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimWafResource } from "../resource/sim-waf-resource.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import { requiredSimWafScope } from "../scope/sim-waf-scope.js";
import { type SimWafResourceKind, simWafArn } from "../sim-wafv2-arn.js";
import type { SimWafAuthorizer } from "./authorize/sim-wafv2-authorizer.js";
import { requiredSimWafId, requiredSimWafName } from "./sim-wafv2-input.js";

/**
 * How every read, update and delete names the resource it works on.
 */
export interface SimWafResourceInput {
  readonly Name?: string | undefined;
  readonly Scope?: string | undefined;
  readonly Id?: string | undefined;
}

export interface SimWafResourceLookup<T extends SimWafResource> {
  readonly store: SimWafResourceStore<T>;
  readonly input: SimWafResourceInput;
  readonly kind: SimWafResourceKind;
  readonly action: string;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Authorize a caller for one WAFv2 resource and then find it.
 *
 * Authorizing before looking up keeps a denial and a missing resource
 * separate, so a caller with no permission for a web ACL never learns whether
 * it is there. The three resource kinds all name themselves the same way,
 * which is why one function covers all of them.
 */
export function requireSimWafResource<T extends SimWafResource>(
  lookup: SimWafResourceLookup<T>,
): T {
  const { input } = lookup;
  const name = requiredSimWafName(input.Name);
  const id = requiredSimWafId(input.Id);
  const scope = requiredSimWafScope(
    input.Scope,
    lookup.accountRegionScope.regionName,
  );

  lookup.authorizer.authorizeResource(
    lookup.action,
    simWafArn({
      accountRegionScope: lookup.accountRegionScope,
      scope,
      kind: lookup.kind,
      name,
      id,
    }),
    lookup.caller,
  );

  return lookup.store.require({ scope, name, id });
}
