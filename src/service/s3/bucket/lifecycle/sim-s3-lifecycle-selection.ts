import type {
  SimS3LifecycleRule,
  SimS3LifecycleRuleAndOperator,
  SimS3LifecycleRuleFilter,
  SimS3LifecycleTag,
} from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
import type { SimS3LifecycleSubject } from "./sim-s3-lifecycle-subject.js";

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
    // A bare `Tag` filter is scoped by the tag alone. It says nothing about
    // the key, so every Object carrying the tag is selected wherever it is.
    return tagsSelect([filter.Tag], subject);
  }

  return (
    subject.key.startsWith(filter.Prefix ?? "") && sizeWithin(filter, subject)
  );
}

function conjunctionSelects(
  operator: SimS3LifecycleRuleAndOperator,
  subject: SimS3LifecycleSubject,
): boolean {
  return (
    subject.key.startsWith(operator.Prefix ?? "") &&
    sizeWithin(operator, subject) &&
    tagsSelect(operator.Tags ?? [], subject)
  );
}

/**
 * Whether the subject carries every tag the filter names.
 *
 * Both halves of a tag have to match, because a rule for `archive=true` says
 * nothing about an Object tagged `archive=false`. A subject carrying no tag
 * set at all, meaning an upload in progress or a delete marker, matches no
 * named tag and is selected only by a filter naming none.
 */
function tagsSelect(
  tags: readonly SimS3LifecycleTag[],
  subject: SimS3LifecycleSubject,
): boolean {
  return tags.every(
    (tag) => subject.tags?.has(tag.Key ?? "", tag.Value ?? "") === true,
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
