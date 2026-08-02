import { simHttpApiPathSegments } from "./route/path/sim-http-api-path-segments.js";

interface SimHttpApiRequestProperties {
  readonly method: string;
  readonly path: string;
}

/**
 * One request arriving at an API's endpoint.
 *
 * The path is the whole request path, stage segment and all, which is what the
 * event reports as `rawPath`. Stage selection takes its own segment off before
 * route selection sees the rest.
 */
export class SimHttpApiRequest {
  public readonly method: string;
  public readonly path: string;

  constructor(properties: SimHttpApiRequestProperties) {
    this.method = properties.method;
    this.path = properties.path;
  }

  /**
   * The path split into the segments matching works through.
   */
  get segments(): readonly string[] {
    return simHttpApiPathSegments(this.path);
  }
}
