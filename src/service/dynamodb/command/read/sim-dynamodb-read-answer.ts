import type { SimDynamoDbFilter } from "../../expression/filter/sim-dynamodb-filter.js";
import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimDynamoDbItemPage } from "../item/sim-dynamodb-item-page.js";
import type { SimDynamoDbSelect } from "./sim-dynamodb-select.js";

/**
 * What a query or a scan answers with, beyond its metadata.
 */
export interface SimDynamoDbReadFields {
  readonly Items?:
    | readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[]
    | undefined;
  readonly Count: number;
  readonly ScannedCount: number;
  readonly LastEvaluatedKey?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
}

interface SimDynamoDbReadAnswerProperties {
  readonly page: SimDynamoDbItemPage;
  readonly filter: SimDynamoDbFilter | undefined;
  readonly projection: SimDynamoDbProjection | undefined;
  readonly select: SimDynamoDbSelect;
  readonly view: SimDynamoDbReadView;
}

/**
 * The page a query or a scan answers with, once its filter has been applied.
 *
 * The order the parts run in is the whole of the behaviour. The walk is cut to
 * the `Limit` first, so `ScannedCount` is how many items the read evaluated.
 * The filter then drops items from that page, so `Count` is how many of them
 * survived. A `Count` below the `Limit` therefore says nothing about whether
 * there is more to read, and a page whose items were all dropped answers with
 * none and still hands out a `LastEvaluatedKey`.
 *
 * Query and Scan answer the same way, so this takes a page rather than either
 * of them.
 */
export class SimDynamoDbReadAnswer {
  private readonly kept: readonly SimDynamoDbItem[];
  private readonly scannedCount: number;
  private readonly lastEvaluatedKey:
    | Record<string, SimDynamoDbAttributeValue>
    | undefined;
  private readonly projection: SimDynamoDbProjection | undefined;
  private readonly select: SimDynamoDbSelect;
  private readonly view: SimDynamoDbReadView;

  constructor(properties: SimDynamoDbReadAnswerProperties) {
    const evaluated = properties.page.items;

    this.scannedCount = evaluated.length;
    this.kept = properties.filter?.applyTo(evaluated) ?? evaluated;
    this.lastEvaluatedKey = properties.page.lastEvaluatedKey;
    this.projection = properties.projection;
    this.select = properties.select;
    this.view = properties.view;
  }

  /**
   * The fields the command output carries.
   */
  fields(): SimDynamoDbReadFields {
    return {
      ...this.items(),
      Count: this.kept.length,
      ScannedCount: this.scannedCount,
      LastEvaluatedKey: this.lastEvaluatedKey,
    };
  }

  /**
   * The items answered with, which a counted read leaves out altogether.
   */
  private items(): Pick<SimDynamoDbReadFields, "Items"> {
    if (this.select.countsOnly) {
      return {};
    }

    return {
      Items: this.kept.map((item) => this.answered(item).toAttributeValues()),
    };
  }

  /**
   * One item as the read answers with it.
   *
   * A `ProjectionExpression` names the attributes it wants, so it is applied to
   * the whole item and the view is not asked to cut one first. On a global
   * secondary index that changes nothing, since every path the projection names
   * has already been checked against what the index projects. On a local
   * secondary index it is what fetches an unprojected attribute from the base
   * table, which is what real DynamoDB does for the same read.
   *
   * Without a projection, a read asking for whole items answers with the whole
   * item, and anything else is cut to what the view carries. That is how a read
   * of an index answers with the attributes that index projects rather than
   * with everything. A read of the table cuts nothing either way.
   */
  private answered(item: SimDynamoDbItem): SimDynamoDbItem {
    if (this.projection !== undefined) {
      return this.projection.apply(item);
    }

    if (this.select.wholeItems) {
      return item;
    }

    return this.view.project(item);
  }
}
