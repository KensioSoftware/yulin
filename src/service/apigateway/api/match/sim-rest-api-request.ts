interface SimRestApiRequestProperties {
  readonly method: string;
  readonly path: string;
}

/**
 * One HTTP request as a simulated REST API sees it for matching.
 *
 * The path is the whole request path, stage segment and all. A REST API always
 * carries its stage as the first segment, and taking it off is the first step
 * of matching rather than something the caller does beforehand.
 */
export class SimRestApiRequest {
  public readonly method: string;
  public readonly path: string;

  constructor(properties: SimRestApiRequestProperties) {
    this.method = properties.method;
    this.path = properties.path;
  }

  /**
   * The path segments, with the empty strings a leading or trailing separator
   * produces dropped.
   */
  get segments(): readonly string[] {
    return this.path.split("/").filter((segment) => segment.length > 0);
  }
}
