import { isRecord } from "../../../../util/type-guard/record.js";

export type SimCfnCfRhPolicyFieldRefuse = (detail: string) => never;

/**
 * Shared field readers for a ResponseHeadersPolicyConfig section, used by
 * both the SecurityHeadersConfig and CorsConfig readers so the type checks
 * every field needs are written once rather than once per section.
 */

/**
 * A named field that must be a string.
 */
export function requiredString(
  item: Record<string, unknown>,
  field: string,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string {
  // oxlint-disable-next-line security/detect-object-injection
  const value = item[field];

  return typeof value === "string"
    ? value
    : refuse(`${context} needs a string ${field}`);
}

/**
 * A named field that must be a number.
 */
export function requiredNumber(
  item: Record<string, unknown>,
  field: string,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): number {
  // oxlint-disable-next-line security/detect-object-injection
  const value = item[field];

  return typeof value === "number"
    ? value
    : refuse(`${context} needs a number ${field}`);
}

/**
 * A named field that must be a boolean.
 */
export function requiredBoolean(
  item: Record<string, unknown>,
  field: string,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): boolean {
  // oxlint-disable-next-line security/detect-object-injection
  const value = item[field];

  return typeof value === "boolean"
    ? value
    : refuse(`${context} needs a boolean ${field}`);
}

/**
 * A named field that must be an object, or nothing when the field is absent.
 */
export function optionalObject(
  item: Record<string, unknown>,
  field: string,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): Record<string, unknown> | undefined {
  // oxlint-disable-next-line security/detect-object-injection
  const value = item[field];

  if (value === undefined) {
    return undefined;
  }

  return isRecord(value) ? value : refuse(`${context} must be an object`);
}

/**
 * The `Items` of one `<name>Config` section, or nothing when the section or
 * its `Items` is absent.
 */
export function sectionItems(
  config: Record<string, unknown>,
  sectionName: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): unknown[] {
  const items = optionalObject(config, sectionName, sectionName, refuse)?.[
    "Items"
  ];

  if (items === undefined) {
    return [];
  }

  return Array.isArray(items)
    ? items
    : refuse(`${sectionName} Items must be an array`);
}
