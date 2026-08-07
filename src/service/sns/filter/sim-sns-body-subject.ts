import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { isFilterPolicyObject } from "./sim-sns-filter-refusals.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";
import type { SimSnsFilterValue } from "./sim-sns-filter-value.js";
import { simSnsJsonFilterValues } from "./sim-sns-json-filter-values.js";

/**
 * Read a published message body as the JSON document a policy matches against.
 *
 * A body that is not JSON, or that is JSON without being an object, holds no
 * keys at all. It is not an error: `MessageBody` filtering is set on the
 * subscription and the body comes from whoever published, so a publisher
 * sending text to a topic one subscription filters on this way would otherwise
 * fail a delivery it knows nothing about. The message simply does not match.
 */
function documentIn(body: string): JSONObject | undefined {
  try {
    const parsed = JSON.parse(body) as JSONValue;

    if (isFilterPolicyObject(parsed)) {
      return parsed;
    }
  } catch {
    // Not JSON, so there is nothing to match against.
  }

  return undefined;
}

/**
 * The parsed message body, as a filter policy of the `MessageBody` scope sees
 * it.
 *
 * This is the scope that nests: a policy names a nested key by nesting itself,
 * and the path is what it nested through.
 */
export class SimSnsBodySubject implements SimSnsFilterSubject {
  private readonly document: JSONObject | undefined;

  private constructor(document: JSONObject | undefined) {
    this.document = document;
  }

  /**
   * Read the body of one published message.
   */
  static of(body: string): SimSnsBodySubject {
    return new this(documentIn(body));
  }

  /**
   * Whether the body holds no keys at all.
   *
   * A body that is not a JSON object holds none, which is what keeps
   * `{"exists": false}` from matching a message that was never JSON in the
   * first place.
   */
  get isEmpty(): boolean {
    return (
      this.document === undefined || Object.keys(this.document).length === 0
    );
  }

  /**
   * The values held at a key path, after going through what nests it.
   */
  valuesAt(path: readonly string[]): readonly SimSnsFilterValue[] {
    let held: JSONValue = this.document ?? null;

    for (const key of path) {
      if (!isFilterPolicyObject(held)) {
        return [];
      }

      // eslint-disable-next-line security/detect-object-injection -- a key the filter policy named, read out of parsed JSON.
      held = held[key] ?? null;
    }

    return simSnsJsonFilterValues(held);
  }
}
