import type { SimWafBodyInspectionResourceType } from "../web-acl/sim-waf-association-config.js";

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

  /**
   * The type of resource the request reached, when it reached one.
   *
   * Only the body inspection limit reads it, and a web ACL evaluated on its
   * own reads the default limit for every resource type.
   */
  readonly resourceType?: SimWafBodyInspectionResourceType | undefined;
}
