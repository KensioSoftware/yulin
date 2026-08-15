import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  type SimCfFunctionUrlOriginTemplateInput,
  simCfFunctionUrlOriginParts,
} from "./sim-cf-function-url-origin-fragments.js";

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
 * The ARN of the Distribution the template creates, written the way CDK writes
 * it.
 */
export const simCfDistributionArn: SimCfnTemplateValue = {
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
 * Builds the template for a Lambda Function URL served through a Distribution
 * with an origin access control.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "site-stack",
 *   template: simCfFunctionUrlOriginTemplateFactory.make({ permitted: false }),
 * });
 * ```
 *
 * The Function URL authorizes with `AWS_IAM`, which is the whole point of the
 * shape: the endpoint exists, and only the Distribution may use it.
 */
export const simCfFunctionUrlOriginTemplateFactory = new MappedFactory<
  SimCfFunctionUrlOriginTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    signingBehavior: "always",
    originAccessControl: true,
    permitted: true,
    permittedActions: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
    permissionSourceArn: simCfDistributionArn,
  }),
  (input) => ({
    Resources: {
      GreeterRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "GreeterRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: { "Fn::GetAtt": ["GreeterRole", "Arn"] },
          Code: {
            ZipFile:
              "exports.handler = async () => " +
              "({ statusCode: 200, body: 'Hello from behind CloudFront' });",
          },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
        },
      },
      GreeterUrl: {
        Type: "AWS::Lambda::Url",
        Properties: {
          TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          AuthType: "AWS_IAM",
        },
      },
      ...simCfFunctionUrlOriginParts(input).originAccessControl,
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Origins: [
              {
                Id: "FunctionUrlOrigin",
                // The Function URL endpoint is a URL, and an Origin takes a
                // domain name, so CDK splits the host out of it.
                DomainName: {
                  "Fn::Select": [
                    2,
                    {
                      "Fn::Split": [
                        "/",
                        { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
                      ],
                    },
                  ],
                },
                CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
                ...simCfFunctionUrlOriginParts(input).originAccessControlId,
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "FunctionUrlOrigin",
              ViewerProtocolPolicy: "redirect-to-https",
            },
          },
        },
      },
      ...simCfFunctionUrlOriginParts(input).invokePermission,
    },
    Outputs: {
      DistributionDomainName: {
        Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
      },
      DistributionArn: { Value: simCfDistributionArn },
    },
  }),
);
