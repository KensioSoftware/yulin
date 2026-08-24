import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The rule fields CloudFormation and the SDK spell differently.
 *
 * CloudFormation flattens an expiry onto the rule and names a transition's
 * timing after it, where the request nests both. Everything absent from here,
 * `Status`, `Prefix`, `AbortIncompleteMultipartUpload`, `TagFilters` and the
 * object size bounds among them, is spelled the same way in both and goes
 * through untouched.
 */
export const simCfnS3TranslatedLifecycleFields: ReadonlySet<string> = new Set([
  "Id",
  "ExpirationDate",
  "ExpirationInDays",
  "ExpiredObjectDeleteMarker",
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
  return Object.fromEntries(
    Object.entries(rule).filter(
      ([name]) => !simCfnS3TranslatedLifecycleFields.has(name),
    ),
  );
}
