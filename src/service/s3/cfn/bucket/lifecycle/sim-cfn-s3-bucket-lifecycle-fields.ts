import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The rule fields CloudFormation and the SDK spell differently.
 *
 * CloudFormation flattens an expiry onto the rule and names a transition's
 * timing after it, where the request nests both. It carries the noncurrent
 * expiry both ways, as the nested object the request takes and as the older
 * `NoncurrentVersionExpirationInDays` beside it, which is what CDK's
 * `noncurrentVersionExpiration` synthesises. It also puts the tags a rule
 * filters on beside the rule's `Prefix`, where the request holds both inside a
 * `Filter`. Everything absent from here, `Status`,
 * `AbortIncompleteMultipartUpload` and the object size bounds among them, is
 * spelled the same way in both and goes through untouched.
 */
export const simCfnS3TranslatedLifecycleFields: ReadonlySet<string> = new Set([
  "Id",
  "ExpirationDate",
  "ExpirationInDays",
  "ExpiredObjectDeleteMarker",
  "NoncurrentVersionExpiration",
  "NoncurrentVersionExpirationInDays",
  "TagFilters",
  "Transition",
  "Transitions",
]);

/**
 * A timestamp as the request wants it. CloudFormation states one as a string,
 * and anything else is left as it came so the shape check that follows sees
 * what the template actually said.
 */
export function simCfnS3LifecycleDate(
  value: SimCfnTemplateValue | undefined,
): SimCfnTemplateValue | undefined {
  if (typeof value !== "string") {
    return value;
  }

  return new Date(value) as unknown as SimCfnTemplateValue;
}

/**
 * The fields that were stated, or nothing at all when none of them were.
 */
export function simCfnS3StatedFields(
  fields: Record<string, SimCfnTemplateValue | undefined>,
): SimCfnTemplateValueRecord | undefined {
  const stated = Object.entries(fields).filter(
    ([, value]) => value !== undefined,
  );

  if (stated.length === 0) {
    return undefined;
  }

  return Object.fromEntries(stated) as SimCfnTemplateValueRecord;
}

/**
 * The fields of a rule this reader has no translation for.
 *
 * Carried across unchanged rather than dropped or refused. Dropping one would
 * deploy a Bucket whose rules read back shorter than the template asked for,
 * and refusing one would fail a Stack over a field nothing in the simulation
 * acts on anyway.
 */
export function simCfnS3CarriedRuleFields(
  rule: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  // A rule filtering on tags carries its prefix inside the `Filter` built from
  // them, and real S3 refuses a rule stating a `Prefix` alongside one.
  const translated =
    rule["TagFilters"] === undefined
      ? simCfnS3TranslatedLifecycleFields
      : new Set([...simCfnS3TranslatedLifecycleFields, "Prefix"]);

  return Object.fromEntries(
    Object.entries(rule).filter(([name]) => !translated.has(name)),
  );
}

/**
 * The three flattened expiry fields, gathered under the one the request
 * carries. A rule stating none of them keeps no `Expiration` at all.
 */
export function simCfnS3RuleExpiration(
  rule: SimCfnTemplateValueRecord,
): SimCfnTemplateValue | undefined {
  return simCfnS3StatedFields({
    Date: simCfnS3LifecycleDate(rule["ExpirationDate"]),
    Days: rule["ExpirationInDays"],
    ExpiredObjectDeleteMarker: rule["ExpiredObjectDeleteMarker"],
  });
}

/**
 * The noncurrent expiry, from whichever of the two spellings the rule used.
 *
 * The nested object is the one the request takes and wins where a template
 * states it. `NoncurrentVersionExpirationInDays` is the older flattened field
 * beside it, and is what CDK synthesises, so a rule carrying only that one
 * still reaches the versions it names.
 */
export function simCfnS3RuleNoncurrentExpiration(
  rule: SimCfnTemplateValueRecord,
): SimCfnTemplateValue | undefined {
  const nested = rule["NoncurrentVersionExpiration"];

  if (nested !== undefined) {
    return nested;
  }

  return simCfnS3StatedFields({
    NoncurrentDays: rule["NoncurrentVersionExpirationInDays"],
  });
}
