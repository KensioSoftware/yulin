/**
 * Serving a private Lambda Function URL through an origin access control.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "greeter-stack",
    template: {
      Resources: {
        GreeterFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: "greeter",
            Role: "arn:aws:iam::888888888888:role/GreeterRole",
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            Code: {
              ZipFile:
                "exports.handler = async () => " +
                "({ statusCode: 200, body: 'Hello from behind CloudFront' });",
            },
          },
        },
        GreeterUrl: {
          Type: "AWS::Lambda::Url",
          Properties: {
            TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
            AuthType: "AWS_IAM",
          },
        },
        GreeterOac: {
          Type: "AWS::CloudFront::OriginAccessControl",
          Properties: {
            OriginAccessControlConfig: {
              Name: "greeter-oac",
              OriginAccessControlOriginType: "lambda",
              SigningBehavior: "always",
              SigningProtocol: "sigv4",
            },
          },
        },
        GreeterDistribution: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              Enabled: true,
              Origins: [
                {
                  Id: "GreeterOrigin",
                  // An Origin takes a domain name, and the Function URL
                  // attribute is a URL, so the host comes out of it.
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
                  OriginAccessControlId: { Ref: "GreeterOac" },
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "GreeterOrigin",
                ViewerProtocolPolicy: "allow-all",
              },
            },
          },
        },
        // Nothing but this Distribution may invoke the Function URL, which is
        // what the condition on the Distribution's ARN says.
        InvokeFromCloudFront: {
          Type: "AWS::Lambda::Permission",
          Properties: {
            FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
            Action: "lambda:InvokeFunctionUrl",
            Principal: "cloudfront.amazonaws.com",
            SourceArn: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:cloudfront::",
                  { Ref: "AWS::AccountId" },
                  ":distribution/",
                  { Ref: "GreeterDistribution" },
                ],
              ],
            },
          },
        },
      },
      Outputs: {
        SiteHostname: {
          Value: { "Fn::GetAtt": ["GreeterDistribution", "DomainName"] },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  const siteHostname = stack.outputs.get("SiteHostname")?.value as string;
  const greeting = await fetch(srv.localUrl(`http://${siteHostname}/greeting`));

  console.log(await greeting.text()); // Hello from behind CloudFront
} finally {
  await srv.close();
}
