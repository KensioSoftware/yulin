import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Refuses a route pointing at an authorizer that was never created.
 *
 * AWS::ApiGatewayV2::Authorizer is not simulated, so a template carrying one
 * has that Resource skipped rather than failed. A skipped Resource matches no
 * value adapter, so a `Ref` to it resolves to its own logical ID, and a route
 * would then deploy holding a logical ID where an authorizer id belongs. Left
 * alone that is a route open here and closed on AWS, which is the divergence
 * worth failing for.
 *
 * The skip reason is deliberately not quoted into the message. A skip reason
 * says "Unsupported sim ... CloudFormation", which is what CloudFormation
 * Resource creation matches to decide a failure is a skip, so repeating it
 * would turn this refusal into another skip.
 */
export class SimCfnHttpApiSkippedAuthorizer {
  /**
   * Refuse a route whose `AuthorizerId` names a Resource this simulation did
   * not create.
   */
  refuse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    resources: ReadonlyMap<string, SimCfnResource>,
  ): void {
    const authorizerId = properties["AuthorizerId"];

    if (typeof authorizerId !== "string") {
      return;
    }

    const referenced = resources.get(authorizerId);

    if (referenced?.skipped !== true) {
      return;
    }

    throw new Error(
      `AWS::ApiGatewayV2::Route ${resource.logicalId} property AuthorizerId ` +
        `is ${authorizerId}, the logical ID of a Resource this simulation ` +
        `did not create. The route would deploy pointing at an authorizer ` +
        `that does not exist, and would then be open here and closed on AWS.`,
    );
  }
}
