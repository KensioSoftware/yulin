import type { SimRestApiResourceStore } from "../resource/sim-rest-api-resource-store.js";
import type { SimRestApiResource } from "../resource/sim-rest-api-resource.js";

/**
 * The resource a request path reached, and the path parameters captured on the
 * way to it.
 */
export interface SimRestApiResourceMatch {
  readonly resource: SimRestApiResource;
  readonly pathParameters: Readonly<Record<string, string>>;
}

/**
 * Walks a request path down a REST API's resource tree.
 *
 * At each segment the children are tried in the order real API Gateway
 * resolves them: an exact literal first, then a single-segment `{name}` path
 * parameter, then a greedy `{name+}` one that takes the rest of the path. That
 * order is what makes `/orders/new` reach a literal `new` resource where an
 * `{orderId}` sibling would otherwise have caught it.
 */
export class SimRestApiResourceWalk {
  /**
   * Find the resource a request path reaches, if the tree has one.
   */
  walk(
    resources: SimRestApiResourceStore,
    segments: readonly string[],
  ): SimRestApiResourceMatch | undefined {
    return this.from(resources, resources.root, segments, {});
  }

  private from(
    resources: SimRestApiResourceStore,
    resource: SimRestApiResource,
    segments: readonly string[],
    captured: Readonly<Record<string, string>>,
  ): SimRestApiResourceMatch | undefined {
    if (segments.length === 0) {
      return { resource, pathParameters: captured };
    }

    const children = resources.children(resource.resourceId);

    return (
      this.literal(resources, children, segments, captured) ??
      this.parameter(resources, children, segments, captured) ??
      this.greedy(children, segments, captured)
    );
  }

  /**
   * Follow a child whose path part is the segment itself.
   */
  private literal(
    resources: SimRestApiResourceStore,
    children: readonly SimRestApiResource[],
    segments: readonly string[],
    captured: Readonly<Record<string, string>>,
  ): SimRestApiResourceMatch | undefined {
    const child = children.find(
      (one) =>
        one.pathPart?.parameterName === undefined &&
        one.pathPart?.pathPart === segments[0],
    );

    return child === undefined
      ? undefined
      : this.from(resources, child, segments.slice(1), captured);
  }

  /**
   * Follow a `{name}` child, capturing the segment it stands for.
   */
  private parameter(
    resources: SimRestApiResourceStore,
    children: readonly SimRestApiResource[],
    segments: readonly string[],
    captured: Readonly<Record<string, string>>,
  ): SimRestApiResourceMatch | undefined {
    const child = children.find(
      (one) => one.pathPart?.parameterName !== undefined && !one.greedy,
    );
    const name = child?.pathPart?.parameterName;

    if (child === undefined || name === undefined) {
      return undefined;
    }

    return this.from(resources, child, segments.slice(1), {
      ...captured,
      /* v8 ignore next -- the walk only recurses while a segment is left */
      [name]: decodedSegment(segments[0] ?? ""),
    });
  }

  /**
   * Follow a `{name+}` child, which takes every segment that is left.
   */
  private greedy(
    children: readonly SimRestApiResource[],
    segments: readonly string[],
    captured: Readonly<Record<string, string>>,
  ): SimRestApiResourceMatch | undefined {
    const child = children.find((one) => one.greedy);
    const name = child?.pathPart?.parameterName;

    if (child === undefined || name === undefined) {
      return undefined;
    }

    return {
      resource: child,
      pathParameters: {
        ...captured,
        [name]: segments.map((segment) => decodedSegment(segment)).join("/"),
      },
    };
  }
}

/**
 * A path segment as a handler reads it. API Gateway percent-decodes what it
 * puts in `pathParameters`, and leaves a segment it cannot decode alone.
 */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
