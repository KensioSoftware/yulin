import type {
  SimS3LifecycleRule,
  SimS3LifecycleRuleAndOperator,
  SimS3LifecycleRuleFilter,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

/**
 * What a lifecycle rule looks at to decide whether it selects something.
 *
 * An Object states its size and a multipart upload leaves it out. Half an
 * upload has no size for a rule to measure, and real S3 has no size to
 * measure either until the parts are joined.
 */
export interface SimS3LifecycleSubject {
  readonly key: string;
  readonly size?: number | undefined;
}

/**
 * The object size bounds a filter or its `And` operator can state.
 */
type SimS3LifecycleSizeBounds = Pick<
  SimS3LifecycleRuleFilter,
  "ObjectSizeGreaterThan" | "ObjectSizeLessThan"
>;

/**
 * Whether a rule selects the Object or upload a key names.
 *
 * A rule states its scope either as the older top-level `Prefix` or as a
 * `Filter`. A rule with no scope at all covers every key in the Bucket. Real
 * S3 refuses a rule stating both.
 *
 * Simulated S3 has no Object tags. A `Tag` or a `TagFilters` entry names a
 * condition the simulator has no answer for, and selects no key.
 */
export function simS3LifecycleRuleSelects(
  rule: SimS3LifecycleRule,
  subject: SimS3LifecycleSubject,
): boolean {
  if (rule.Filter === undefined) {
    return subject.key.startsWith(rule.Prefix ?? "");
  }

  return filterSelects(rule.Filter, subject);
}

function filterSelects(
  filter: SimS3LifecycleRuleFilter,
  subject: SimS3LifecycleSubject,
): boolean {
  if (filter.And !== undefined) {
    return conjunctionSelects(filter.And, subject);
  }

  if (filter.Tag !== undefined) {
    return false;
  }

  return (
    subject.key.startsWith(filter.Prefix ?? "") && sizeWithin(filter, subject)
  );
}

function conjunctionSelects(
  operator: SimS3LifecycleRuleAndOperator,
  subject: SimS3LifecycleSubject,
): boolean {
  if ((operator.Tags ?? []).length > 0) {
    return false;
  }

  return (
    subject.key.startsWith(operator.Prefix ?? "") &&
    sizeWithin(operator, subject)
  );
}

/**
 * Whether the subject's size falls inside the bounds a filter states.
 *
 * A subject with no size, meaning an upload still in progress, falls outside
 * any stated bound. A rule narrowed to Objects of a certain size says nothing
 * about parts on their way to becoming one.
 */
function sizeWithin(
  bounds: SimS3LifecycleSizeBounds,
  subject: SimS3LifecycleSubject,
): boolean {
  const { ObjectSizeGreaterThan: greaterThan, ObjectSizeLessThan: lessThan } =
    bounds;

  if (greaterThan === undefined && lessThan === undefined) {
    return true;
  }

  if (subject.size === undefined) {
    return false;
  }

  return (
    (greaterThan === undefined || subject.size > greaterThan) &&
    (lessThan === undefined || subject.size < lessThan)
  );
}
