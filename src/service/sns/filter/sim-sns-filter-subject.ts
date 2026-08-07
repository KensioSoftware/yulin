import type { SimSnsFilterValue } from "./sim-sns-filter-value.js";

/**
 * Whatever a filter policy is matched against.
 *
 * There are two, because there are two filter policy scopes: the message
 * attributes of a publish, and the parsed message body. Both answer the same
 * question, which is what a key holds, so an operator never has to know which
 * of them it is looking at.
 *
 * A key path is a list because a message body nests and a policy under the
 * `MessageBody` scope names a nested key by nesting itself. Message attributes
 * are flat, so a path of more than one part finds nothing there.
 */
export interface SimSnsFilterSubject {
  /**
   * Whether the message carries nothing at all at this scope.
   *
   * A key missing from a message that carries other keys is not the same thing
   * as a message carrying none, and `{"exists": false}` is the operator that
   * tells them apart: real SNS matches the first and not the second.
   */
  readonly isEmpty: boolean;

  /**
   * Every value held at a key path, which is empty when nothing is held there.
   *
   * A key can hold more than one value: a `String.Array` attribute and a JSON
   * array both do, and a policy matching any member of one matches the key.
   */
  valuesAt(path: readonly string[]): readonly SimSnsFilterValue[];
}
