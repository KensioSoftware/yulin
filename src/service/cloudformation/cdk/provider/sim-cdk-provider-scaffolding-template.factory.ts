import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants the template CDK synthesizes around a
 * `BucketDeployment`.
 *
 * One construct becomes four Resources, only one of which this simulator
 * creates. The other three are the provider CDK would have run: an AWS CLI
 * Layer, a Python function, and that function's log group. A second deployment
 * adds another Layer and another custom Resource, and shares the one provider,
 * because CDK builds the function as a singleton.
 *
 * The logical IDs here are readable rather than the hashed ones CDK generates.
 * That is the point: nothing recognising this scaffolding is allowed to match
 * on a name CDK made up.
 */
export interface SimCdkProviderScaffoldingTemplateInput {
  readonly bucketName: string;
  /** The staged asset object key each deployment copies from, in turn. */
  readonly sourceObjectKeys: readonly string[];
  /** Resources a test adds beside the scaffolding. */
  readonly resources: SimCfnTemplateValueRecord;
}

const providerLogicalId = "BucketDeploymentProvider";
const assetsBucketName = "cdk-hnb659fds-assets-111111111111-eu-west-2";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * Builds the template CDK synthesizes for one or more `BucketDeployment`
 * constructs sharing a destination Bucket.
 *
 * ```typescript
 * const template = simCdkProviderScaffoldingTemplateFactory.make({
 *   sourceObjectKeys: ["site.zip", "fonts.zip"],
 * });
 * ```
 *
 * The asset object keys have to match an assets manifest beside the template
 * file for the deployments themselves to copy anything, so a test using this
 * writes both.
 */
export const simCdkProviderScaffoldingTemplateFactory = new MappedFactory<
  SimCdkProviderScaffoldingTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    bucketName: "site-bucket",
    sourceObjectKeys: ["site.zip"],
    resources: {},
  }),
  (input) => ({
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: input.bucketName },
      },
      [`${providerLogicalId}Role`]: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "bucket-deployment-provider-role",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      [providerLogicalId]: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Code: { S3Bucket: assetsBucketName, S3Key: "provider.zip" },
          Handler: "index.handler",
          Layers: [{ Ref: `${deploymentPrefix(0)}AwsCliLayer` }],
          Role: { "Fn::GetAtt": [`${providerLogicalId}Role`, "Arn"] },
          Runtime: "python3.13",
          Timeout: 900,
        },
      },
      [`${providerLogicalId}LogGroup`]: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: {
            "Fn::Join": ["", ["/aws/lambda/", { Ref: providerLogicalId }]],
          },
          RetentionInDays: 731,
        },
      },
      ...deploymentResources(input),
      ...input.resources,
    },
  }),
);

/**
 * The Layer and custom Resource each deployment contributes.
 *
 * Every deployment gets its own AWS CLI Layer, and only the first one's is
 * named by the shared provider function's `Layers`, so the rest are reachable
 * from nothing in the template. That is why a Layer is recognised on what it
 * is rather than on what points at it.
 */
function deploymentResources(
  input: SimCdkProviderScaffoldingTemplateInput,
): SimCfnTemplateValueRecord {
  const resources: SimCfnTemplateValueRecord = {};

  for (const [index, sourceObjectKey] of input.sourceObjectKeys.entries()) {
    const prefix = deploymentPrefix(index);

    resources[`${prefix}AwsCliLayer`] = {
      Type: "AWS::Lambda::LayerVersion",
      Properties: {
        Content: {
          S3Bucket: assetsBucketName,
          S3Key: "awscli.zip",
        },
        Description: "/opt/awscli/aws",
      },
    };

    resources[`${prefix}CustomResource`] = {
      Type: "Custom::CDKBucketDeployment",
      Properties: {
        ServiceToken: { "Fn::GetAtt": [providerLogicalId, "Arn"] },
        SourceBucketNames: [assetsBucketName],
        SourceObjectKeys: [sourceObjectKey],
        DestinationBucketName: { Ref: "SiteBucket" },
        Prune: index === 0,
      },
    };
  }

  return resources;
}

function deploymentPrefix(index: number): string {
  return `Deploy${index}`;
}
