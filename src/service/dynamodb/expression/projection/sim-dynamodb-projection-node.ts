import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { simDynamoDbExpressionError } from "../sim-dynamodb-expression-error.js";

/**
 * One point in a projection, and what was asked for below it.
 *
 * The paths a projection names are merged into a tree before anything is read,
 * so `address.city` and `address.postcode` become one `address` holding two
 * attributes rather than two separate reads that would then have to be put back
 * together.
 */
export class SimDynamoDbProjectionNode {
  private readonly expressionName: string;
  private whole = false;
  private readonly attributes = new Map<string, SimDynamoDbProjectionNode>();
  private readonly indexes = new Map<number, SimDynamoDbProjectionNode>();

  constructor(expressionName: string) {
    this.expressionName = expressionName;
  }

  /**
   * Add a path to the tree, from the segment at an offset onwards.
   *
   * Two paths where one contains the other are refused, as real DynamoDB
   * refuses them: `address` and `address.city` together do not say whether the
   * whole map or one attribute of it was wanted.
   */
  add(path: SimDynamoDbDocumentPath, offset = 0): void {
    const segment = path.segments.at(offset);

    if (segment === undefined) {
      this.claimWhole(path);

      return;
    }

    if (this.whole) {
      throw this.overlapError(path);
    }

    if (segment.kind === "attribute") {
      this.childAttribute(segment.name).add(path, offset + 1);

      return;
    }

    this.childIndex(segment.index).add(path, offset + 1);
  }

  /**
   * Read the part of a value this node asked for, or nothing when the value has
   * no such part.
   *
   * A path the item does not have is left out rather than refused. The
   * projection says where to look, and an item is free not to have it.
   */
  apply(value: SimDynamoDbValue): SimDynamoDbValue | undefined {
    if (this.whole) {
      return value;
    }

    if (value.kind === "M" && this.attributes.size > 0) {
      return this.projectedMap(value.entries);
    }

    if (value.kind === "L" && this.indexes.size > 0) {
      return this.projectedList(value.values);
    }

    return undefined;
  }

  /**
   * Read the attributes this node asked for out of a map of them.
   *
   * The order the item holds them in is kept, rather than the order the
   * expression named them in, so a projected item reads like the item it came
   * from.
   */
  projectAttributes(
    entries: ReadonlyMap<string, SimDynamoDbValue>,
  ): ReadonlyMap<string, SimDynamoDbValue> {
    const projected = new Map<string, SimDynamoDbValue>();

    for (const [name, value] of entries) {
      const node = this.attributes.get(name);
      const part = node?.apply(value);

      if (part !== undefined) {
        projected.set(name, part);
      }
    }

    return projected;
  }

  /**
   * Take the whole of whatever is here, refusing a path already broken up.
   */
  private claimWhole(path: SimDynamoDbDocumentPath): void {
    if (this.whole || this.attributes.size > 0 || this.indexes.size > 0) {
      throw this.overlapError(path);
    }

    this.whole = true;
  }

  private childAttribute(name: string): SimDynamoDbProjectionNode {
    const existing = this.attributes.get(name);

    if (existing !== undefined) {
      return existing;
    }

    const added = new SimDynamoDbProjectionNode(this.expressionName);
    this.attributes.set(name, added);

    return added;
  }

  private childIndex(index: number): SimDynamoDbProjectionNode {
    const existing = this.indexes.get(index);

    if (existing !== undefined) {
      return existing;
    }

    const added = new SimDynamoDbProjectionNode(this.expressionName);
    this.indexes.set(index, added);

    return added;
  }

  /**
   * The map this node asked for, or nothing when it holds none of it.
   */
  private projectedMap(
    entries: ReadonlyMap<string, SimDynamoDbValue>,
  ): SimDynamoDbValue | undefined {
    const projected = this.projectAttributes(entries);

    if (projected.size === 0) {
      return undefined;
    }

    return { kind: "M", entries: projected };
  }

  /**
   * The list elements this node asked for, closed up.
   *
   * Projecting `lines[2]` on its own answers with a one element list, as real
   * DynamoDB does, rather than a list with two gaps before it. The elements
   * stay in the order the list holds them.
   */
  private projectedList(
    values: readonly SimDynamoDbValue[],
  ): SimDynamoDbValue | undefined {
    const projected = this.indexes
      .entries()
      .toArray()
      .toSorted(([first], [second]) => first - second)
      .map(([index, node]) => this.elementAt(values, index, node))
      .filter((value) => value !== undefined);

    if (projected.length === 0) {
      return undefined;
    }

    return { kind: "L", values: projected };
  }

  /**
   * The part of one list element a node asked for, if the list reaches it.
   */
  private elementAt(
    values: readonly SimDynamoDbValue[],
    index: number,
    node: SimDynamoDbProjectionNode,
  ): SimDynamoDbValue | undefined {
    const value = values.at(index);

    if (value === undefined) {
      return undefined;
    }

    return node.apply(value);
  }

  private overlapError(path: SimDynamoDbDocumentPath): Error {
    return simDynamoDbExpressionError(
      this.expressionName,
      `two document paths overlap with each other, at '${path.text}'`,
    );
  }
}
