import type { SimCfnServiceResourceFactory } from "../../factory/sim-cfn-resource-factory.type.js";
import { SimCdkBucketDeploymentResourceFactory } from "../../../cdk/s3/bucket-deployment/sim-cdk-bucket-deployment.js";
import { SimCdkBucketNotificationsResourceFactory } from "../../../cdk/s3/bucket-notifications/sim-cdk-bucket-notifications.js";

/**
 * How one CDK custom Resource hands over its factory.
 *
 * Nothing is passed in, because a custom Resource names the Bucket or the
 * function it acts on in its own properties and reads the Account and Region
 * scope off the Resource being created.
 */
type SimCdkCustomResourceFactory = () => SimCfnServiceResourceFactory;

/**
 * The CDK custom Resource types this simulator creates.
 *
 * CDK reaches several features through a `Custom::` Resource backed by its own
 * Lambda function rather than through a CloudFormation Resource type, so a
 * synthesized template contains them whether or not the app mentions a custom
 * resource. Each entry here replaces the work that function would have done.
 *
 * A `Custom::` type with no entry is not created, which is what the resolver
 * turns into an unsupported-Resource error.
 */
export const simCdkCustomResourceFactories: ReadonlyMap<
  string,
  SimCdkCustomResourceFactory
> = new Map([
  [
    "CDKBucketDeployment",
    (): SimCfnServiceResourceFactory =>
      new SimCdkBucketDeploymentResourceFactory(),
  ],
  [
    "S3BucketNotifications",
    (): SimCfnServiceResourceFactory =>
      new SimCdkBucketNotificationsResourceFactory(),
  ],
]);
