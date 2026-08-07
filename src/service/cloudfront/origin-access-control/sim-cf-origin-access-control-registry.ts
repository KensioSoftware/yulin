import { SimCloudFrontOriginAccessControlAlreadyExists } from "../error/sim-cloudfront.error.js";
import type {
  SimCloudFrontOriginAccessControl,
  SimCloudFrontOriginAccessControlId,
  SimCloudFrontOriginAccessControlMap,
} from "./sim-cf-origin-access-control.js";

/**
 * The origin access controls one simulated CloudFront holds.
 *
 * They are found by ID, which is what an Origin's `OriginAccessControlId`
 * names, and by name, which is what decides whether a new one may be stored.
 */
export class SimCloudFrontOriginAccessControlRegistry {
  private readonly originAccessControls: SimCloudFrontOriginAccessControlMap =
    new Map();

  /**
   * Store an origin access control, refusing a name another one already holds
   * as CloudFront does.
   */
  add(originAccessControl: SimCloudFrontOriginAccessControl): void {
    if (this.byName(originAccessControl.name) !== undefined) {
      throw new SimCloudFrontOriginAccessControlAlreadyExists(
        `Sim CloudFront origin access control ${originAccessControl.name} already exists`,
      );
    }

    this.originAccessControls.set(originAccessControl.id, originAccessControl);
  }

  /**
   * Forget an origin access control.
   */
  remove(originAccessControlId: SimCloudFrontOriginAccessControlId): void {
    this.originAccessControls.delete(originAccessControlId);
  }

  /**
   * Get an origin access control by ID.
   */
  byId(
    originAccessControlId: SimCloudFrontOriginAccessControlId | string,
  ): SimCloudFrontOriginAccessControl | undefined {
    return this.originAccessControls.get(
      originAccessControlId as SimCloudFrontOriginAccessControlId,
    );
  }

  /**
   * Get an origin access control by name.
   */
  byName(
    originAccessControlName: string,
  ): SimCloudFrontOriginAccessControl | undefined {
    return this.originAccessControls
      .values()
      .find(
        (originAccessControl) =>
          originAccessControl.name === originAccessControlName,
      );
  }
}
