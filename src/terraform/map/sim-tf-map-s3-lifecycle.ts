/*
 * The bucket lifecycle configuration, which the provider declares as a
 * resource of its own and CloudFormation carries on the bucket.
 *
 * Simulated S3 expires an Object and abandons an upload against these rules,
 * and transitions nothing between storage classes. The rules are carried
 * across whole, transitions included, so that a bucket reads back configured
 * as the plan asked for.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformResourceFold } from "../sim-tf-mapping.type.js";

/** The resource that configures a bucket's lifecycle rules. */
export const s3LifecycleFolds: ReadonlyMap<string, TerraformResourceFold> =
  new Map([
    [
      "aws_s3_bucket_lifecycle_configuration",
      { parentAttribute: "bucket", properties: bucketLifecycle },
    ],
  ]);

/** The lifecycle rules a bucket is deployed with. */
function bucketLifecycle(
  context: TerraformMappingContext,
): Record<string, SimCfnTemplateValue> {
  const rules = blocks(context, "rule").map((rule) => lifecycleRule(rule));

  return rules.length === 0 ? {} : { LifecycleConfiguration: { Rules: rules } };
}

function lifecycleRule(rule: Record<string, unknown>): SimCfnTemplateValue {
  const expiration = firstBlock(rule, "expiration");
  const noncurrent = firstBlock(rule, "noncurrent_version_expiration");
  const abortAfter = number(
    firstBlock(rule, "abort_incomplete_multipart_upload"),
    "days_after_initiation",
  );

  return properties({
    Id: text(rule, "id"),
    Status: text(rule, "status"),
    Prefix: text(rule, "prefix") ?? filterPrefix(rule),
    ExpirationInDays: number(expiration, "days"),
    ExpirationDate: text(expiration, "date"),
    NoncurrentVersionExpirationInDays: number(noncurrent, "noncurrent_days"),
    AbortIncompleteMultipartUpload:
      abortAfter === undefined
        ? undefined
        : { DaysAfterInitiation: abortAfter },
    Transitions: transitions(rule),
  });
}

/**
 * The prefix a rule matches on, where it was written as a filter.
 *
 * The provider takes a prefix either as the rule's own deprecated attribute or
 * inside a `filter` block, and CloudFormation has the one `Prefix`.
 */
function filterPrefix(rule: Record<string, unknown>): string | undefined {
  return text(firstBlock(rule, "filter"), "prefix");
}

/** The storage class changes a rule asks for, as CloudFormation lists them. */
function transitions(
  rule: Record<string, unknown>,
): SimCfnTemplateValue | undefined {
  const declared = field(rule, "transition");
  const entries = (Array.isArray(declared) ? declared : [])
    .filter((entry) => isRecord(entry))
    .map((entry) =>
      properties({
        StorageClass: text(entry, "storage_class"),
        TransitionInDays: number(entry, "days"),
        TransitionDate: text(entry, "date"),
      }),
    );

  return entries.length === 0 ? undefined : entries;
}

/**
 * One entry of a nested block, which the plan represents as a list even where
 * the schema allows only one.
 */
function firstBlock(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const declared = record === undefined ? undefined : field(record, key);
  const [first] = Array.isArray(declared) ? (declared as unknown[]) : [];

  return isRecord(first) ? first : undefined;
}

/**
 * A string field of a block, where the provider wrote one.
 *
 * An absent optional string inside a nested block arrives as an empty string
 * rather than as null, and a rule carrying an empty `Prefix` matches every
 * object rather than none.
 */
function text(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record === undefined ? undefined : field(record, key);

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record === undefined ? undefined : field(record, key);

  return typeof value === "number" ? value : undefined;
}
