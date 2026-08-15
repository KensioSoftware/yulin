import {
  assertIdentical,
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

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
 * The ARN of the Distribution a Lambda permission is granted for, written the
 * way CDK writes it.
 */
const distributionArn = {
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

interface FunctionUrlOriginTemplateProperties {
  /**
   * How the origin access control signs, which is `always` in what CDK emits.
   */
  readonly signingBehavior?: string;
  /**
   * The permission admitting CloudFront, left out to deploy the shape a
   * template that forgot it has.
   */
  readonly invokePermission?: Record<string, SimCfnTemplateValue> | undefined;
}

/**
 * The Stack CDK synthesizes for
 * `origins.FunctionUrlOrigin.withOriginAccessControl()`: an `AWS_IAM` Function
 * URL, an origin access control of origin type `lambda`, a Distribution
 * pointing at the Function URL's domain, and the permission letting CloudFront
 * invoke it.
 */
function functionUrlOriginTemplate(
  properties: FunctionUrlOriginTemplateProperties = {},
): CfnTemplateBodyRecord {
  const { signingBehavior = "always" } = properties;
  const invokePermission =
    properties.invokePermission === undefined
      ? {}
      : {
          InvokeFromCloudFront: {
            Type: "AWS::Lambda::Permission",
            Properties: properties.invokePermission,
          },
        };

  return {
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
      SiteOac: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: "site-oac",
            OriginAccessControlOriginType: "lambda",
            SigningBehavior: signingBehavior,
            SigningProtocol: "sigv4",
          },
        },
      },
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
                OriginAccessControlId: { Ref: "SiteOac" },
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "FunctionUrlOrigin",
              ViewerProtocolPolicy: "redirect-to-https",
            },
          },
        },
      },
      ...invokePermission,
    },
    Outputs: {
      DistributionDomainName: {
        Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
      },
    },
  };
}

/**
 * The permission CDK emits alongside the Distribution, granting CloudFront the
 * Function URL for that Distribution alone.
 */
const cloudFrontInvokePermission = {
  FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
  Action: "lambda:InvokeFunctionUrl",
  Principal: "cloudfront.amazonaws.com",
  SourceArn: distributionArn,
};

/**
 * Deploy the Stack and fetch a path through the Distribution it created.
 */
async function fetchThroughDistribution(
  template: CfnTemplateBodyRecord,
): Promise<Response> {
  const simAws = new SimAws();
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "site-stack", template });
  await stack.waitForDeployComplete();

  const distributionDomainName = stack.outputs.get(
    "DistributionDomainName",
  )?.value;
  assertTypeString(distributionDomainName);

  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${distributionDomainName}/greeting`,
    }).toString(),
  );
}

describe("Simulated CloudFront custom Origin with an origin access control", () => {
  it("reaches an AWS_IAM Function URL as the CloudFront service principal", async () => {
    // Given the Stack CDK synthesizes for a Function URL Origin behind an
    // origin access control.
    const response = await fetchThroughDistribution(
      functionUrlOriginTemplate({
        invokePermission: cloudFrontInvokePermission,
      }),
    );

    // Then the handler ran, which an Origin reached anonymously could never
    // get past the auth type to do.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("is refused when nothing granted CloudFront the Function URL", async () => {
    // Given the same Stack without the AWS::Lambda::Permission, which is the
    // template mistake this is worth catching.
    const response = await fetchThroughDistribution(
      functionUrlOriginTemplate(),
    );

    // Then the Function URL refuses the Origin request, and the refusal is
    // what the viewer sees, rather than the Distribution admitting it anyway.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("is refused when the permission names another Distribution", async () => {
    // Given a permission granted for a Distribution other than this one.
    const response = await fetchThroughDistribution(
      functionUrlOriginTemplate({
        invokePermission: {
          ...cloudFrontInvokePermission,
          SourceArn: "arn:aws:cloudfront::888888888888:distribution/E1OTHER123",
        },
      }),
    );

    // Then the Origin request carries the Distribution it really came from, so
    // the condition does not match and the Function URL refuses it.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("reaches the Origin anonymously when the origin access control never signs", async () => {
    // Given an origin access control turned off with a `never` signing
    // behaviour, and the permission still in place.
    const response = await fetchThroughDistribution(
      functionUrlOriginTemplate({
        signingBehavior: "never",
        invokePermission: cloudFrontInvokePermission,
      }),
    );

    // Then nothing states who the Origin request is from, so the AWS_IAM
    // Function URL refuses it, as it refuses any anonymous request.
    assertResponseStatus(response, 403, await describeResponse(response));
  });
});
