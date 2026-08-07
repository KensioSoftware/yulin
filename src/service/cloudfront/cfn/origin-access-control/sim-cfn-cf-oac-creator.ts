import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { SimCfnCfOriginAccessControlConfig } from "./sim-cfn-cf-oac-config.js";

interface SimCfnCfOriginAccessControlCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated origin access controls from
 * AWS::CloudFront::OriginAccessControl Resources.
 */
export class SimCfnCfOriginAccessControlCreator {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfOriginAccessControlCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create and store the origin access control one Resource describes.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCloudFrontOriginAccessControl {
    const originAccessControl = new SimCfnCfOriginAccessControlConfig({
      resource,
      properties,
    }).build();

    this.cloudFront.addOriginAccessControl(originAccessControl);

    return originAccessControl;
  }

  /**
   * Remove an origin access control created from a Resource.
   */
  delete(resource: SimCfnResource): void {
    const originAccessControl = resource.simResource as
      | SimCloudFrontOriginAccessControl
      | undefined;

    if (originAccessControl === undefined) {
      return;
    }

    this.cloudFront.removeOriginAccessControl(originAccessControl.id);
  }
}
