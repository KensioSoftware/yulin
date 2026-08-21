import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesIdentityTag } from "../../identity/sim-ses-identity-settings.js";

/**
 * Read a template value that should be a nested record.
 *
 * Anything else reads as absent. An identity's settings are all declarative,
 * so a malformed one leaves the identity reporting the default rather than
 * taking the deploy down over a value nothing here acts on.
 */
export function optionalRecord(
  value: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

/** Read a template value that should be a string. */
export function optionalString(
  value: SimCfnTemplateValue | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Read a template value that should be a boolean.
 *
 * CloudFormation carries booleans as the strings `"true"` and `"false"` where
 * a template wrote them in quotes or a `Ref` resolved to one, so both spellings
 * are read.
 */
export function optionalBoolean(
  value: SimCfnTemplateValue | undefined,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "false") {
    return value === "true";
  }

  return undefined;
}

/**
 * Read the tag list off a Resource, keeping the entries that have both halves.
 */
export function tagList(
  value: SimCfnTemplateValue | undefined,
): readonly SimSesIdentityTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const tag = optionalRecord(entry);
    const key = optionalString(tag?.["Key"]);
    const tagValue = optionalString(tag?.["Value"]);

    return key === undefined || tagValue === undefined
      ? []
      : [{ Key: key, Value: tagValue }];
  });
}
