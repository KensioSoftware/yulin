import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimUpdateItemCommandOutput } from "./item.command.js";
import type { SimDynamoDbReturnValues } from "./sim-dynamodb-return-values.js";

interface SimDynamoDbUpdateAnswerProperties {
  readonly asked: SimDynamoDbReturnValues;
  readonly touched: SimDynamoDbProjection;
}

/**
 * How much of an item an UpdateItem answers with.
 *
 * The five modes are two questions rather than five answers: which item is
 * being reported, the one before the update or the one after it, and whether
 * the whole of it is reported or only the parts the expression touched.
 */
export class SimDynamoDbUpdateAnswer {
  private readonly asked: SimDynamoDbReturnValues;
  private readonly touched: SimDynamoDbProjection;

  constructor(properties: SimDynamoDbUpdateAnswerProperties) {
    this.asked = properties.asked;
    this.touched = properties.touched;
  }

  /**
   * The output for an update that has already been applied.
   */
  of(
    existing: SimDynamoDbItem | undefined,
    updated: SimDynamoDbItem,
  ): SimUpdateItemCommandOutput {
    if (this.asked.reportsAfter()) {
      return this.attributesOf(updated);
    }

    if (this.asked.reportsBefore() && existing !== undefined) {
      return this.attributesOf(existing);
    }

    return { $metadata: {} };
  }

  /**
   * The attributes of an item, cut down to what the request asked for.
   *
   * Nothing at all comes back as no `Attributes` rather than as an empty map,
   * which is how a caller tells `UPDATED_NEW` on an expression that only
   * removed attributes from one that changed something.
   */
  private attributesOf(item: SimDynamoDbItem): SimUpdateItemCommandOutput {
    const reported = this.reported(item);

    if (reported.attributeNames().length === 0) {
      return { $metadata: {} };
    }

    return { Attributes: reported.toAttributeValues(), $metadata: {} };
  }

  /**
   * As much of an item as the mode reports.
   */
  private reported(item: SimDynamoDbItem): SimDynamoDbItem {
    if (this.asked.reportsOnlyChanged()) {
      return this.touched.apply(item);
    }

    return item;
  }
}
