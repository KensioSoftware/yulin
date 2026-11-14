import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamTagInput } from "../tag/sim-iam-identity-tags.js";

interface SimCfnIamPropertyInput {
  readonly resourceType: string;
  readonly resource: SimCfnResource;
  readonly value: SimCfnTemplateValueRecord[string] | undefined;
  readonly label: string;
}

/**
 * Read a string property an IAM Resource may leave out.
 *
 * A Role and a User read most of their own properties this way, and both
 * refuse a non-string the same way, naming the Resource type the template
 * declared.
 */
export function simCfnIamOptionalString(
  properties: SimCfnIamPropertyInput,
): string | undefined {
  const { resourceType, resource, value, label } = properties;

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${label} must be a string`,
    );
  }

  return value;
}

/**
 * Read a whole-number property an IAM Resource may leave out.
 *
 * A template resolves a number to either a number or its decimal text, and
 * both are read as the number.
 */
export function simCfnIamOptionalInteger(
  properties: SimCfnIamPropertyInput,
): number | undefined {
  const { resourceType, resource, value, label } = properties;

  if (value === undefined) {
    return undefined;
  }

  const number = typeof value === "string" ? Number(value) : value;

  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${label} must be an integer`,
    );
  }

  return number;
}

/**
 * Read a JSON-object property an IAM Resource requires.
 *
 * A Role's trust policy arrives as the object the template wrote, and IAM
 * takes its policy documents as JSON text. A value of any other shape fails
 * the Resource, naming the Resource type the template declared.
 */
export function simCfnIamJsonObject(
  properties: SimCfnIamPropertyInput,
): string {
  const { resourceType, resource, value, label } = properties;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${label} must be an object`,
    );
  }

  return JSON.stringify(value);
}

/**
 * Read the `Tags` of a Role or a User.
 *
 * A CDK app calling `Tags.of(stack).add(...)` puts these on every taggable
 * Resource in the template, so a tagged Role is the ordinary case. Each tag
 * has to be an object holding a string `Key` and a string `Value`. IAM checks
 * what they say when the Role or User is created.
 */
export function simCfnIamTags(
  resourceType: string,
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): readonly SimIamTagInput[] | undefined {
  const value = properties["Tags"];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every(isTagShape)) {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: Tags must be a list of tags with a string Key and Value`,
    );
  }

  return value.map((tag) => ({ Key: tag.Key, Value: tag.Value }));
}

/**
 * Whether one template value is a tag.
 */
function isTagShape(
  value: unknown,
): value is { readonly Key: string; readonly Value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "Key" in value &&
    "Value" in value &&
    typeof value.Key === "string" &&
    typeof value.Value === "string"
  );
}

/**
 * Read a list of names an IAM Resource may leave out, such as the `Groups` a
 * User joins or the `Users` added to a group. Refs resolve to names before
 * creation, so every entry is a string.
 */
export function simCfnIamNameList(
  properties: SimCfnIamPropertyInput,
): readonly string[] {
  const { resourceType, resource, value, label } = properties;

  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    !value.every((name): name is string => typeof name === "string")
  ) {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${label} must be an array of strings`,
    );
  }

  return value;
}
