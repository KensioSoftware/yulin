import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";

/**
 * One request put to whatever web ACL is in front of the resource it reached.
 */
export interface SimWafProtectedRequest {
  /** The resource the request reached, by ARN. */
  readonly resourceArn: string;

  readonly request: Request;

  /**
   * The request body, when the rules might inspect it. A request body is a
   * stream that cannot be read twice, so it is passed in already buffered.
   */
  readonly body?: Uint8Array | undefined;
}

/**
 * The web ACLs a fronting service's resources are protected by.
 *
 * A service serving a request asks this what the web ACL in front of the
 * resource decided, and tells it when a resource is deleted. That is how API
 * Gateway reaches simulated WAFv2 without depending on it.
 */
export interface SimWafProtection {
  /**
   * Whether a web ACL is in front of one resource.
   *
   * Asked before a request is put to a web ACL, because inspecting one means
   * buffering its body and a resource with no web ACL has no reason to.
   */
  protects(resourceArn: string): boolean;

  /**
   * What the web ACL in front of one resource decides about a request, or
   * nothing when no web ACL is in front of it.
   */
  decide(request: SimWafProtectedRequest): SimWafDecision | undefined;

  /**
   * Forget whatever protects a resource, as deleting the resource does.
   */
  release(resourceArn: string): void;
}

/**
 * The protection available to a service with no WAFv2 to ask.
 *
 * Nothing is in front of anything, so a standalone simulated API Gateway
 * serves every request the way it did before web ACLs existed.
 */
export class SimWafNoProtection implements SimWafProtection {
  /**
   * Nothing is protected here.
   */
  protects(): boolean {
    return false;
  }

  /**
   * No web ACL decides anything here.
   */
  decide(): undefined {
    return;
  }

  /**
   * There is nothing held against a resource to let go of.
   */
  release(): void {
    return;
  }
}
