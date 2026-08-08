/**
 * A simulated static site reached through a CloudFront origin access control,
 * which every test about serving a private Bucket needs before it can say
 * anything about the response.
 *
 * This lives under `test/` for the same reasons as `site-fixture.ts` beside it.
 */

import { assertNonNullable } from "@kensio/smartass";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontOriginAccessControlSigningBehavior } from "../../src/service/cloudfront/origin-access-control/sim-cf-origin-access-control.js";

export const simCfOacSiteBucketName = "oac-site-bucket";

export const simCfOacSitePage = "<h1>Home</h1>";

/**
 * The Distribution ARN as a template writes it, which is what CDK's
 * `S3BucketOrigin.withOriginAccessControl` synthesizes for the condition.
 */
export const simCfOacSiteDistributionArn = {
  "Fn::Join": [
    "",
    [
      "arn:aws:cloudfront::",
      { Ref: "AWS::AccountId" },
      ":distribution/",
      { Ref: "SiteDistribution" },
    ],
  ],
};

/**
 * A statement granting CloudFront the read, conditioned on the Distribution
 * making it. `AWS:SourceArn` is CDK's spelling of `aws:SourceArn`, and
 * condition key names are matched case insensitively.
 */
export function simCfOacCloudFrontReadStatement(
  sourceArn: SimCfnTemplateValue,
): SimCfnTemplateValue {
  return {
    Effect: "Allow",
    Principal: { Service: "cloudfront.amazonaws.com" },
    Action: "s3:GetObject",
    Resource: `arn:aws:s3:::${simCfOacSiteBucketName}/*`,
    Condition: { StringEquals: { "AWS:SourceArn": sourceArn } },
  };
}

/**
 * A statement granting everyone the read, which is what a Bucket reached
 * anonymously needs.
 */
export const simCfOacPublicReadStatement = {
  Effect: "Allow",
  Principal: "*",
  Action: "s3:GetObject",
  Resource: `arn:aws:s3:::${simCfOacSiteBucketName}/*`,
};

export interface SimCfOacSiteStackProperties {
  readonly statement: SimCfnTemplateValue;

  /**
   * An omitted signing behaviour leaves the origin access control out
   * altogether, so the Origin is one that was never given one.
   */
  readonly signingBehavior?: SimCloudFrontOriginAccessControlSigningBehavior;

  /**
   * Opt the Bucket out of the block on public Bucket policies, which a publicly
   * readable site Bucket has to do and a Bucket reached through an origin
   * access control does not.
   */
  readonly publicPolicyAllowed?: boolean;
}

export interface SimCfOacSite {
  readonly simAws: SimAws;
  readonly distributionId: string;
}

/**
 * Deploy a site Stack shaped the way CDK builds one: a Bucket, an origin access
 * control, a Distribution naming it, and a Bucket policy naming the
 * Distribution back.
 *
 * The Bucket policy comes last because it needs the Distribution's ARN, which
 * is why nothing about the read can be settled when the Distribution is
 * created. The page goes in after the Stack, so the Bucket policy is the only
 * thing deciding whether the Distribution can read it back.
 */
export async function simCfOacSiteStack(
  properties: SimCfOacSiteStackProperties,
): Promise<SimCfOacSite> {
  const simAws = new SimAws();
  const withOac = properties.signingBehavior !== undefined;

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "oac-site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: simCfOacSiteBucketName,
            ...(properties.publicPolicyAllowed === true && {
              PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
            }),
          },
        },
        ...(withOac && {
          SiteOac: {
            Type: "AWS::CloudFront::OriginAccessControl",
            Properties: {
              OriginAccessControlConfig: {
                Name: "site-oac",
                OriginAccessControlOriginType: "s3",
                SigningBehavior: properties.signingBehavior,
                SigningProtocol: "sigv4",
              },
            },
          },
        }),
        SiteDistribution: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              Enabled: true,
              Origins: [
                {
                  Id: "SiteOrigin",
                  DomainName: `${simCfOacSiteBucketName}.s3.amazonaws.com`,
                  S3OriginConfig: {},
                  ...(withOac && { OriginAccessControlId: { Ref: "SiteOac" } }),
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
              },
            },
          },
        },
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "SiteBucket" },
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [properties.statement],
            },
          },
        },
      },
      Outputs: { DistributionId: { Value: { Ref: "SiteDistribution" } } },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: simCfOacSiteBucketName,
      Key: "index.html",
      ContentType: "text/html",
      Body: simCfOacSitePage,
    }),
  );

  const distributionId = stack.outputs.get("DistributionId")?.value;
  assertNonNullable(distributionId);

  return { simAws, distributionId: distributionId as string };
}
