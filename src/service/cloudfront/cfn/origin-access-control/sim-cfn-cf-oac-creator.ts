import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
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
  private static readonly createAction = "cloudfront:CreateOriginAccessControl";
  private static readonly deleteAction = "cloudfront:DeleteOriginAccessControl";

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
    options?: SimCfnResourceCallerOptions,
  ): SimCloudFrontOriginAccessControl {
    this.cloudFront
      .cfnAuthorizer()
      .authorizeAny(SimCfnCfOriginAccessControlCreator.createAction, options);

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
  delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): void {
    const originAccessControl = resource.simResource as
      | SimCloudFrontOriginAccessControl
      | undefined;

    if (originAccessControl === undefined) {
      return;
    }

    this.cloudFront
      .cfnAuthorizer()
      .authorizeResource(
        SimCfnCfOriginAccessControlCreator.deleteAction,
        `origin-access-control/${originAccessControl.id}`,
        options,
      );

    this.cloudFront.removeOriginAccessControl(originAccessControl.id);
  }
}
