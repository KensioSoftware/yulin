/**
 * A CDK Distribution running a Lambda@Edge function at the viewer request.
 */

import { Stack } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/**
 * Example CDK stack whose Distribution rewrites every request at the edge.
 *
 * The stack is in us-east-1, the one Region CloudFront runs a Lambda@Edge
 * function from.
 */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, { env: { region: "us-east-1" } });

    const siteBucket = new s3.Bucket(this, "SiteBucket");

    // A Lambda@Edge execution role trusts both service principals.
    const edgeRole = new iam.Role(this, "EdgeRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com"),
      ),
    });

    const rewriteFunction = new lambda.Function(this, "RewriteFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      role: edgeRole,
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  const { request } = event.Records[0].cf;
  request.uri = "/index.html";
  return request;
};
`),
    });

    new cloudfront.Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        edgeLambdas: [
          {
            // edgeLambdas takes a published version, and currentVersion
            // is one.
            functionVersion: rewriteFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }
}
