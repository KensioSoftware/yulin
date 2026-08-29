import type {
  SimCloudFrontOriginAccessControl,
  SimCloudFrontOriginAccessControlId,
} from "./origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontOriginAccessControlRegistry } from "./origin-access-control/sim-cf-origin-access-control-registry.js";
import { SimCloudFrontPolicies } from "./sim-cloudfront-policies.js";

/**
 * The origin access controls one simulated CloudFront holds.
 *
 * An Origin names one by ID, and this is where it is found. There is no
 * CreateOriginAccessControl command in this simulation, so CloudFormation is
 * the only thing that makes one, and these methods are how it hands one over.
 * `SimCloudFront` extends this, and a caller reaches them on the one service
 * object.
 */
export class SimCloudFrontOriginAccessControls extends SimCloudFrontPolicies {
  protected readonly originAccessControls =
    new SimCloudFrontOriginAccessControlRegistry();

  /**
   * Store a simulated origin access control.
   *
   * A name another origin access control already holds is refused, as
   * CloudFront refuses one.
   */
  addOriginAccessControl(
    originAccessControl: SimCloudFrontOriginAccessControl,
  ): void {
    this.originAccessControls.add(originAccessControl);
  }

  /**
   * Forget a simulated origin access control.
   */
  removeOriginAccessControl(
    originAccessControlId: SimCloudFrontOriginAccessControlId,
  ): void {
    this.originAccessControls.remove(originAccessControlId);
  }

  /**
   * Get a simulated origin access control by ID.
   */
  getOriginAccessControlById(
    originAccessControlId: SimCloudFrontOriginAccessControlId | string,
  ): SimCloudFrontOriginAccessControl | undefined {
    return this.originAccessControls.byId(originAccessControlId);
  }
}
