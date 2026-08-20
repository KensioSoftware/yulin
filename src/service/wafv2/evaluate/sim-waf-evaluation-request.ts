/**
 * What a web ACL is asked to decide about.
 */
export interface SimWafEvaluationRequest {
  /** The web ACL to evaluate against, by ARN. */
  readonly webAclArn: string;

  readonly request: Request;

  /**
   * The request body, when the rules might inspect it. A request body is a
   * stream that cannot be read twice, so it is passed in already buffered.
   */
  readonly body?: Uint8Array | undefined;
}
