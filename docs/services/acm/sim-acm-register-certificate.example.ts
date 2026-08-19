/**
 * Registering a simulated ACM certificate with a chosen certificate ARN.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The certificate ARN a CDK app carried into the template of the stack using it.
const certificateArn =
  "arn:aws:acm:us-east-1:111122223333:certificate/3b82191c-b029-4e5f-a94f-038f98a53ede";

// Register it in the account and region the ARN itself names.
simAws
  .account("111122223333")
  .region("us-east-1")
  .acm()
  .registerCertificate({
    arn: certificateArn,
    domainName: "example.test",
    subjectAlternativeNames: ["www.example.test"],
  });

const stack = await simAws
  .account("111122223333")
  .region("us-east-1")
  .cloudFormation()
  .deployTemplate({
    stackName: "site-stack",
    template: {
      Resources: {
        SiteDistribution: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              CallerReference: "site-distribution",
              Enabled: true,
              Aliases: ["www.example.test"],
              DefaultCacheBehavior: {
                TargetOriginId: "origin",
                ViewerProtocolPolicy: "redirect-to-https",
              },
              ViewerCertificate: {
                AcmCertificateArn: certificateArn,
                SslSupportMethod: "sni-only",
              },
            },
          },
        },
      },
    },
  });

await stack.waitForDeployComplete();

console.log(stack.getResource("SiteDistribution")?.status);
