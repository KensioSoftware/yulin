import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * One step of a document path: an attribute of a map.
 */
export interface SimDynamoDbAttributeSegment {
  readonly kind: "attribute";
  readonly name: string;
}

/**
 * One step of a document path: an element of a list.
 */
export interface SimDynamoDbIndexSegment {
  readonly kind: "index";
  readonly index: number;
}

/**
 * One step of a document path.
 */
export type SimDynamoDbDocumentPathSegment =
  | SimDynamoDbAttributeSegment
  | SimDynamoDbIndexSegment;

/**
 * Where in an item one expression is pointing.
 *
 * A path is an attribute name, then any number of further attributes and list
 * indexes: `address.city`, `lines[0].sku`. It says where to look rather than
 * what is there, so the same path reads an item that has it and passes over an
 * item that does not.
 */
export class SimDynamoDbDocumentPath {
  public readonly segments: readonly SimDynamoDbDocumentPathSegment[];

  constructor(segments: readonly SimDynamoDbDocumentPathSegment[]) {
    this.segments = segments;
  }

  /**
   * How many levels deep this path reaches.
   */
  get depth(): number {
    return this.segments.length;
  }

  /**
   * What this path names, as text no other path can produce.
   *
   * Two paths that print the same are not always the same path: an attribute
   * whose name carries a dot has to be written as a placeholder, and prints as
   * though it were two attributes. Anything comparing paths compares this
   * rather than the printed form.
   */
  get identity(): string {
    return jsonStringify(this.segments);
  }

  /**
   * Whether this path starts at one named attribute of the item.
   *
   * A path into a map or a list is still a path into the attribute it starts
   * at, so `order.status` starts at `order`. That is what a rule about which
   * attributes an expression may name is asking about.
   */
  startsAt(attributeName: string): boolean {
    const first = this.segments.at(0);

    return first?.kind === "attribute" && first.name === attributeName;
  }

  /**
   * The path written back out, for a refusal to name.
   *
   * Placeholders are gone by this point, so this is the path the request meant
   * rather than the path it wrote.
   */
  get text(): string {
    return this.segments
      .map((segment, index) => this.segmentText(segment, index))
      .join("");
  }

  private segmentText(
    segment: SimDynamoDbDocumentPathSegment,
    index: number,
  ): string {
    if (segment.kind === "index") {
      return `[${segment.index.toString()}]`;
    }

    if (index === 0) {
      return segment.name;
    }

    return `.${segment.name}`;
  }
}
