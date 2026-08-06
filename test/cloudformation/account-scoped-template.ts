import {
  jsonParse,
  jsonStringify,
  type JSONString,
} from "../../src/util/type-guard/json.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";

/**
 * The account a template was synthesized against, carried in the names it
 * holds.
 */
const synthesizedAccount = "-123456789012";

interface AccountScopedTemplateProperties {
  readonly withUploads?: boolean;
  readonly withCache?: boolean;
}

/**
 * A synthesized template whose Bucket names carry the account it was
 * synthesized against.
 *
 * This stands in for whatever a real template holds that a simulation cannot
 * resolve, such as an ARN naming a real account or a Hosted Zone ID that came
 * from a lookup: a value the simulator has no way to reach, and the reason for
 * adapting the template on the way in rather than editing the file.
 */
export function accountScopedTemplate(
  properties: AccountScopedTemplateProperties = {},
): object {
  const { withUploads = false, withCache = false } = properties;

  return {
    Resources: {
      Site: accountScopedBucket("site-content"),
      ...(withUploads && { Uploads: accountScopedBucket("site-uploads") }),
      ...(withCache && { Cache: accountScopedBucket("site-cache") }),
    },
  };
}

/**
 * Take the account off every name in the template, as adapting a real template
 * to a simulated environment does.
 */
export function withoutSynthesizedAccount(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  return jsonParse(
    jsonStringify(template).replaceAll(
      synthesizedAccount,
      "",
    ) as JSONString<CfnTemplateBodyRecord>,
  );
}

/**
 * The name a Bucket has in the synthesized template, before anything adapts it.
 */
export function accountScopedName(bucketName: string): string {
  return `${bucketName}${synthesizedAccount}`;
}

function accountScopedBucket(bucketName: string): object {
  return {
    Type: "AWS::S3::Bucket",
    Properties: { BucketName: accountScopedName(bucketName) },
  };
}
