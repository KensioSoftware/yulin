import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";

/**
 * The characters a base path segment may be written with, which is the set
 * real API Gateway accepts for an `ApiMappingKey`.
 */
const mappingKeySegment = /^[\w$\-.+!*'()]+$/u;

/**
 * The base path a domain serves one API under.
 *
 * An empty key is the root of the domain, which is the mapping a request
 * reaching a path no other mapping claims is served by. A non-empty key is one
 * or more path segments, and the segments are kept rather than the string
 * because that is what a request path is compared against.
 */
export class SimApiMappingKey {
  public readonly segments: readonly string[];

  private constructor(segments: readonly string[]) {
    this.segments = segments;
  }

  /**
   * Read an `ApiMappingKey` as it was written, refusing one that could never
   * match a request path.
   *
   * An absent key and an empty one are the same thing, and both are the root
   * of the domain. A leading or trailing slash, or an empty segment inside the
   * key, is refused rather than trimmed: each is a path the writer did not
   * mean, and trimming it here would serve requests under a base path the
   * command was never given.
   */
  static parse(value: string | undefined): SimApiMappingKey {
    if (value === undefined || value.length === 0) {
      return new SimApiMappingKey([]);
    }

    const segments = value.split("/");

    for (const segment of segments) {
      if (!mappingKeySegment.test(segment)) {
        throw new SimApiGatewayV2BadRequest(
          `ApiMappingKey '${value}' is not a base path: a base path is one or ` +
            `more path segments, with no leading or trailing slash`,
        );
      }
    }

    return new SimApiMappingKey(segments);
  }

  /**
   * The key as `ApiMappingKey` reports it, which is the empty string for a
   * mapping serving the root of its domain.
   */
  get value(): string {
    return this.segments.join("/");
  }

  /**
   * How many segments this key takes off a request path, which is what decides
   * between two mappings that both match.
   */
  get depth(): number {
    return this.segments.length;
  }

  /**
   * Whether a request's path segments begin with this base path.
   *
   * The root mapping matches everything, since it takes no segments.
   */
  matches(pathSegments: readonly string[]): boolean {
    return pathSegments.slice(0, this.depth).join("/") === this.value;
  }

  /**
   * The request path segments left for the API's routes, once this base path
   * has been taken off the front.
   */
  remainder(pathSegments: readonly string[]): readonly string[] {
    return pathSegments.slice(this.depth);
  }

  /**
   * The request path as the invocation event reports it, with this base path
   * taken off the front.
   *
   * AWS documents `rawPath` in a payload format 2.0 event as not carrying the
   * API mapping value, and points a handler that needs the whole path at
   * format 1.0 and its `path` field. A base path is therefore unlike a named
   * stage's segment, which the event does report.
   *
   * The path is sliced rather than rebuilt from the segments, so a trailing
   * slash the client sent survives.
   */
  remainingPath(path: string): string {
    if (this.depth === 0) {
      return path;
    }

    // The base path plus the slash in front of it. A request to the base path
    // itself leaves nothing, which is the root of what the mapping serves.
    const remaining = path.slice(this.value.length + 1);

    return remaining.length === 0 ? "/" : remaining;
  }
}
