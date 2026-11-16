import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimWafResource } from "./sim-waf-resource.js";

/**
 * A resource store that can find a resource by its ARN.
 */
interface SimWafResourcesByArn {
  findByArn(arn: string): SimWafResource | undefined;
}

/**
 * IAM authorization that gives a policy the tags of the web ACL, IP set or
 * regex pattern set a request acts on, as `aws:ResourceTag/<key>`.
 *
 * A resource's tags are held as they were written. An entry without a string
 * `Key` is passed over.
 */
export function simWafTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  stores: readonly SimWafResourcesByArn[],
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const found = stores
      .values()
      .map((store) => store.findByArn(resource))
      .find((candidate) => candidate !== undefined);

    return found === undefined ? undefined : simWafTagRecord(found.tags);
  });
}

/**
 * The tags a WAFv2 request or resource holds, value by key. They are held as
 * they were written, and an entry without a string `Key` is passed over.
 */
export function simWafTagRecord(
  tags: readonly unknown[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    tags.flatMap((tag) => {
      const { Key, Value } = (tag ?? {}) as {
        readonly Key?: unknown;
        readonly Value?: unknown;
      };

      return typeof Key === "string"
        ? [[Key, typeof Value === "string" ? Value : ""]]
        : [];
    }),
  );
}
