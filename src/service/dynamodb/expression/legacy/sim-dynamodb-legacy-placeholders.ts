import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";

/**
 * The placeholders a legacy request is rewritten with.
 *
 * A legacy parameter names attributes and values directly. The expression it
 * becomes names each of them through a placeholder, so an attribute name that
 * is a reserved word, or that holds a character an expression cannot carry,
 * reads the same way it did. A request cannot carry placeholders of its own
 * alongside a legacy parameter, so these never meet any the caller wrote.
 */
export class SimDynamoDbLegacyPlaceholders {
  private readonly names = new Map<string, string>();
  private readonly values = new Map<string, SimDynamoDbAttributeValue>();

  /**
   * The placeholder an attribute name is written as, the same one each time
   * the name comes up.
   */
  name(attribute: string): string {
    const known = this.names.get(attribute);

    if (known !== undefined) {
      return known;
    }

    const placeholder = `#n${this.names.size.toString()}`;

    this.names.set(attribute, placeholder);

    return placeholder;
  }

  /**
   * The placeholder a value is written as. Each value gets its own.
   */
  value(value: SimDynamoDbAttributeValue): string {
    const placeholder = `:v${this.values.size.toString()}`;

    this.values.set(placeholder, value);

    return placeholder;
  }

  /**
   * The placeholder parameters the rewritten request carries, leaving out
   * either one that holds nothing.
   */
  get parameters(): SimDynamoDbExpressionParameterInput {
    return {
      ExpressionAttributeNames: nonEmpty(
        Object.fromEntries(
          this.names
            .entries()
            .map(([attribute, placeholder]) => [placeholder, attribute]),
        ),
      ),
      ExpressionAttributeValues: nonEmpty(Object.fromEntries(this.values)),
    };
  }
}

/**
 * A record, or nothing in place of an empty one.
 */
function nonEmpty<Value>(
  record: Readonly<Record<string, Value>>,
): Readonly<Record<string, Value>> | undefined {
  return Object.keys(record).length > 0 ? record : undefined;
}
