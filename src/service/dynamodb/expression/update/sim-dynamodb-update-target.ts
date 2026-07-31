import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  SimDynamoDbDocumentPath,
  SimDynamoDbDocumentPathSegment,
} from "../sim-dynamodb-document-path.js";
import {
  simDynamoDbUpdateError,
  simDynamoDbUpdateUnsupported,
} from "./sim-dynamodb-update-refusal.js";

/**
 * Where in an item one update action writes.
 *
 * A target is a document path that has been checked for what an update can
 * change: attribute names all the way down, since list element paths are not
 * simulated. Holding the names rather than the segments is what lets the item
 * be written a level at a time.
 */
export class SimDynamoDbUpdateTarget {
  /** The attribute this path starts at, which the table's key schema may name. */
  public readonly head: string;

  /** The attributes below the first one, which may be none. */
  public readonly rest: readonly string[];

  /** The path written back out, for a refusal to name. */
  public readonly text: string;

  private readonly names: readonly string[];

  constructor(path: SimDynamoDbDocumentPath) {
    const names = path.segments.map((segment) => attributeName(segment, path));
    const head = names.at(0);

    assertDefined(head, "DynamoDB update expression document path attribute");

    this.head = head;
    this.rest = names.slice(1);
    this.names = names;
    this.text = path.text;
  }

  /**
   * Whether this target and another point at the same place, or one of them
   * points inside the other.
   *
   * Two actions writing to overlapping paths do not say which of them the item
   * should end up with, so real DynamoDB refuses the pair.
   */
  overlaps(other: SimDynamoDbUpdateTarget): boolean {
    const depth = Math.min(this.names.length, other.names.length);
    const theirs = other.names.slice(0, depth);

    return this.names
      .slice(0, depth)
      .every((name, index) => name === theirs.at(index));
  }

  /**
   * Whether this target writes to one of the attributes named.
   *
   * Only the attribute the path starts at counts. A key attribute is a scalar,
   * so nothing inside another attribute is ever part of the key.
   */
  namesOneOf(attributeNames: readonly string[]): boolean {
    return attributeNames.includes(this.head);
  }
}

/**
 * The attribute name one segment of an update target is.
 */
function attributeName(
  segment: SimDynamoDbDocumentPathSegment,
  path: SimDynamoDbDocumentPath,
): string {
  if (segment.kind === "index") {
    throw simDynamoDbUpdateUnsupported(
      `The list element path '${path.text}'`,
      "writing an element real DynamoDB would shift the list around",
    );
  }

  return segment.name;
}

/**
 * Refuse an update whose actions write over each other.
 */
export function assertSimDynamoDbUpdateTargetsAgree(
  targets: readonly SimDynamoDbUpdateTarget[],
): void {
  for (const [index, target] of targets.entries()) {
    const overlapping = targets
      .slice(index + 1)
      .find((other) => target.overlaps(other));

    if (overlapping !== undefined) {
      throw simDynamoDbUpdateError(
        `Two document paths overlap with each other; must remove or rewrite ` +
          `one of these paths: '${target.text}' and '${overlapping.text}'`,
      );
    }
  }
}
