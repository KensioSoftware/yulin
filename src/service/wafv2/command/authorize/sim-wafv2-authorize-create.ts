import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simIamTagOnCreate } from "../../../iam/tag/sim-iam-tag-on-create.js";
import { simWafTagRecord } from "../../resource/sim-waf-resource-tags.js";
import type { SimWafAuthorizer } from "./sim-wafv2-authorizer.js";

/**
 * Ensure the caller may create a resource with the tags its request carries.
 *
 * A request carrying tags needs `wafv2:TagResource` on the new resource as
 * well, and both actions see the tags as `aws:RequestTag/<key>` and
 * `aws:TagKeys`.
 */
export function simWafAuthorizeCreate(
  authorizer: SimWafAuthorizer,
  action: string,
  resource: string,
  tags: readonly unknown[] | undefined,
  caller?: SimAwsCaller,
): void {
  const request = simIamTagOnCreate(
    action,
    "wafv2:TagResource",
    Object.entries(simWafTagRecord(tags ?? [])).map(([Key, Value]) => ({
      Key,
      Value,
    })),
  );

  for (const each of request.actions) {
    authorizer.authorizeResource(each, resource, caller, request.conditions);
  }
}
