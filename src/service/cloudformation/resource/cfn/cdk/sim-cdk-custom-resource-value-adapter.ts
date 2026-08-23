import { SimCdkCrossRegionParameterReading } from "../../../cdk/ssm/cross-region-parameter/sim-cdk-cross-region-parameter-reading.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimCdkCrossRegionParameterCfn } from "./sim-cdk-cross-region-parameter-cfn.js";

/**
 * The CloudFormation-facing value adapter for a CDK custom Resource this
 * simulator carries out itself.
 *
 * A custom Resource belongs to CDK rather than to an AWS service, so the
 * adapters for them sit together here rather than beside the service whose
 * work the Resource does. Most of them answer nothing: a Bucket notification
 * and a BucketDeployment have no existence for a Ref or an Fn::GetAtt to
 * reach, and neither is created as a simulated object. The ones listed here
 * are the custom Resources a template reads a value back out of.
 */
export function cdkCustomResourceValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (properties.simResource instanceof SimCdkCrossRegionParameterReading) {
    return new SimCdkCrossRegionParameterCfn({
      logicalId: properties.logicalId,
      reading: properties.simResource,
    });
  }

  return undefined;
}
