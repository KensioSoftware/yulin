import { isRecord } from "../../../util/type-guard/record.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../template/value/sim-cfn-template-value.js";

/**
 * Whether a template value is an object, and so something the expansion can
 * read properties off.
 *
 * A SAM template is written by hand more often than a CloudFormation one is,
 * and the expansion reads what it finds. A property in the wrong shape is left
 * for the Resource it expands into to refuse, where the diagnostic names the
 * Resource type and the property.
 */
export function isSamTemplateRecord(
  value: unknown,
): value is SimCfnTemplateValueRecord {
  return isRecord(value);
}

/**
 * A record without one of its keys.
 *
 * An event states the Resource it points at under a name of its own, `Queue`
 * against `EventSourceArn` and `Topic` against `TopicArn`, and everything else
 * it states is named the way the Resource names it. Dropping the one and
 * carrying the rest is what expands the event without a list of property names
 * to keep up to date, and a property the Resource has no meaning for is refused
 * by the Resource rather than dropped here.
 */
export function samRecordWithout(
  record: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== name),
  );
}

/**
 * The record one name of a record holds, or an empty one where it holds
 * nothing or holds something else.
 *
 * An expansion reading its way into a Resource asks for `Properties` and then
 * for a property of them, and a Resource stating neither is a Resource with
 * nothing there rather than a template to refuse.
 */
export function samRecordAt(
  record: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValueRecord {
  // oxlint-disable-next-line security/detect-object-injection -- a template record read by the name of one of its own properties.
  const value = record[name];

  return isSamTemplateRecord(value) ? value : {};
}

/**
 * A template value as a list, or an empty one where it is not a list at all.
 *
 * Adding to a list a Resource may not carry is the same shape everywhere it
 * happens, whether the list is notification configurations, Role policies or
 * the `DependsOn` of a Resource.
 */
export function samValueList(
  value: SimCfnTemplateValue | undefined,
): readonly SimCfnTemplateValue[] {
  return Array.isArray(value) ? value : [];
}
