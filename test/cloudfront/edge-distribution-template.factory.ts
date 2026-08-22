import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The logical ID of the published version a Behavior's association names.
 */
export const edgeVersionLogicalId = "EdgeVersion";

/**
 * The logical ID of the Distribution the template declares.
 */
export const edgeDistributionLogicalId = "SiteDistribution";

/**
 * The Origin the Distribution serves from.
 */
const originId = "site-origin";

/**
 * A handler that sends every request to the one page the site has.
 */
const rewriteHandlerSource = `
exports.handler = async (event) => {
  const { request } = event.Records[0].cf;
  request.uri = "/edge.html";
  return request;
};
`;

/**
 * What a test asks for when it wants a template whose Distribution runs a
 * Lambda@Edge function.
 */
export interface EdgeDistributionTemplateInput {
  /** The Bucket the Distribution's S3 Origin serves from. */
  readonly bucketName: string;

  /** The source of the function the associations name. */
  readonly handlerSource: string;

  /**
   * The service principals the execution role trusts.
   *
   * A Lambda@Edge role trusts both `lambda.amazonaws.com` and
   * `edgelambda.amazonaws.com`. A test about the refusal names one of them.
   */
  readonly trustedServices: readonly string[];

  /** The `LambdaFunctionAssociations` of the default cache Behavior. */
  readonly associations: readonly SimCfnTemplateValueRecord[];

  /** The path-based cache Behaviors, each stated whole. */
  readonly cacheBehaviors: readonly SimCfnTemplateValueRecord[];
}

/**
 * Builds a template declaring an execution role, a function, a published
 * version and a Distribution whose default Behavior associates that version.
 *
 * ```typescript
 * const template = edgeDistributionTemplateFactory.make({
 *   bucketName: "edge-site",
 * });
 * ```
 *
 * The stack deploys into whichever Region it is given, so a test that wants a
 * function CloudFront will run deploys it into `us-east-1`, which is the
 * default Region of a `SimAws`.
 */
export const edgeDistributionTemplateFactory = new MappedFactory<
  EdgeDistributionTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    bucketName: "edge-site",
    handlerSource: rewriteHandlerSource,
    trustedServices: ["lambda.amazonaws.com", "edgelambda.amazonaws.com"],
    associations: [
      {
        EventType: "viewer-request",
        LambdaFunctionARN: { Ref: edgeVersionLogicalId },
      },
    ],
    cacheBehaviors: [],
  }),
  (input) => ({
    Resources: {
      EdgeRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "EdgeFunctionRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: [...input.trustedServices] },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      EdgeFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "edge-function",
          Role: { "Fn::GetAtt": ["EdgeRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: { ZipFile: input.handlerSource },
        },
      },
      [edgeVersionLogicalId]: {
        Type: "AWS::Lambda::Version",
        Properties: { FunctionName: { Ref: "EdgeFunction" } },
      },
      [edgeDistributionLogicalId]: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Origins: [
              {
                Id: originId,
                DomainName: `${input.bucketName}.s3.amazonaws.com`,
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: originId,
              ViewerProtocolPolicy: "allow-all",
              LambdaFunctionAssociations: [...input.associations],
            },
            CacheBehaviors: [...input.cacheBehaviors],
          },
        },
      },
    },
  }),
);

/**
 * A path-based cache Behavior running these associations.
 */
export function edgeCacheBehavior(
  pathPattern: string,
  associations: readonly SimCfnTemplateValueRecord[],
): SimCfnTemplateValueRecord {
  return {
    PathPattern: pathPattern,
    TargetOriginId: originId,
    ViewerProtocolPolicy: "allow-all",
    LambdaFunctionAssociations: [...associations],
  };
}
