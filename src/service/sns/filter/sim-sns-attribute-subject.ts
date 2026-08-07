import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimSnsMessageAttribute } from "../message/sim-sns-message-attribute.js";
import type { SimSnsMessageAttributes } from "../message/sim-sns-message-attributes.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";
import { SimSnsFilterValue } from "./sim-sns-filter-value.js";
import { simSnsJsonFilterValues } from "./sim-sns-json-filter-values.js";

/**
 * Read the members of a `String.Array` attribute.
 *
 * The text is a JSON array, and a policy matches any member of it. Text that is
 * not one is matched as the text it is, rather than the publish being failed
 * here: a message attribute's value is not validated as JSON when it is
 * published, so a filter policy is not the place to start.
 */
function arrayValues(text: string): readonly SimSnsFilterValue[] {
  try {
    const parsed = JSON.parse(text) as JSONValue;

    if (Array.isArray(parsed)) {
      return simSnsJsonFilterValues(parsed);
    }
  } catch {
    // Not JSON, so there are no members to read.
  }

  return [SimSnsFilterValue.ofText(text)];
}

/**
 * Read one message attribute as the values a policy can match against it.
 *
 * A binary attribute has none. Real SNS filters on the text of an attribute,
 * and bytes are not text, so a policy naming a binary attribute matches nothing
 * rather than matching its base64.
 */
function valuesOf(
  attribute: SimSnsMessageAttribute,
): readonly SimSnsFilterValue[] {
  if (attribute.isBinary) {
    return [];
  }

  const text = attribute.value.toString("utf8");

  if (attribute.isNumber) {
    return [SimSnsFilterValue.ofNumericText(text)];
  }

  if (attribute.isStringArray) {
    return arrayValues(text);
  }

  return [SimSnsFilterValue.ofText(text)];
}

/**
 * The message attributes of a publish, as a filter policy sees them.
 *
 * This is the default scope, and the flat one: an attribute has a name and no
 * structure under it, so a policy nesting keys under this scope is refused when
 * it is set.
 */
export class SimSnsAttributeSubject implements SimSnsFilterSubject {
  private readonly byName: ReadonlyMap<string, readonly SimSnsFilterValue[]>;

  private constructor(
    byName: ReadonlyMap<string, readonly SimSnsFilterValue[]>,
  ) {
    this.byName = byName;
  }

  /**
   * Read the message attributes of one publish.
   */
  static of(attributes: SimSnsMessageAttributes): SimSnsAttributeSubject {
    return new this(
      new Map(
        attributes.all.map((attribute) => [
          attribute.name,
          valuesOf(attribute),
        ]),
      ),
    );
  }

  /**
   * The values the attribute of a name holds, if there is one.
   */
  valuesAt(path: readonly string[]): readonly SimSnsFilterValue[] {
    const [name] = path;

    if (path.length !== 1 || name === undefined) {
      return [];
    }

    return this.byName.get(name) ?? [];
  }
}
