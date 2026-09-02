import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { SimDynamoDbProjectionNode } from "./sim-dynamodb-projection-node.js";

interface SimDynamoDbProjectionProperties {
  readonly expressionName: string;
  readonly paths: readonly SimDynamoDbDocumentPath[];
}

/**
 * The parts of an item a ProjectionExpression asked for.
 *
 * A projection is built once from the paths and then applied to whatever items
 * a read finds, so the same expression does not have to be parsed per item.
 */
export class SimDynamoDbProjection {
  private readonly root: SimDynamoDbProjectionNode;
  private readonly paths: readonly SimDynamoDbDocumentPath[];

  constructor(properties: SimDynamoDbProjectionProperties) {
    this.root = new SimDynamoDbProjectionNode(properties.expressionName);
    this.paths = properties.paths;

    for (const path of properties.paths) {
      this.root.add(path);
    }
  }

  /**
   * Refuse a projection naming an attribute the view being read does not carry.
   *
   * A global secondary index holds only what it projects, so a path outside
   * that would leave the attribute out of every item it answers with. An
   * attribute quietly missing reads as an item that happens not to have it,
   * which is the answer a projection used as an allow-list must never give. A
   * local secondary index fetches from the base table, so any path is nameable
   * there.
   */
  assertNamesOnlyCarried(view: SimDynamoDbReadView): void {
    view.assertCarriesPaths(this.paths);
  }

  /**
   * Cut an item down to what this projection asked for.
   *
   * A path the item does not have is left out. Real DynamoDB answers with the
   * parts it found rather than with a NULL standing in for the parts it did
   * not, so an item with none of the projected paths comes back with no
   * attributes at all.
   */
  apply(item: SimDynamoDbItem): SimDynamoDbItem {
    return SimDynamoDbItem.ofAttributes(
      this.root.projectAttributes(item.entries()),
    );
  }
}
