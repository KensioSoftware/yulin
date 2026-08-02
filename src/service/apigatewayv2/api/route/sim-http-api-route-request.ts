interface SimHttpApiRouteRequestProperties {
  readonly method: string;
  readonly segments: readonly string[];
}

/**
 * One request as route selection sees it: the HTTP method, and the path
 * segments left once the stage has taken its own.
 *
 * A named stage is a path segment the routes know nothing about, so
 * `/dev/pets/6` on stage `dev` reaches route selection as `pets` then `6`.
 */
export class SimHttpApiRouteRequest {
  public readonly method: string;
  public readonly segments: readonly string[];

  constructor(properties: SimHttpApiRouteRequestProperties) {
    this.method = properties.method;
    this.segments = properties.segments;
  }
}
