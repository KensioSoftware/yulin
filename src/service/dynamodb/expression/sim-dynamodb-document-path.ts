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
  SimDynamoDbAttributeSegment | SimDynamoDbIndexSegment;

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
