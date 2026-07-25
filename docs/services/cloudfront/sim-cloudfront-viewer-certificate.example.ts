/**
 * Catching an ACM certificate CloudFront will not accept.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A certificate alongside the rest of the stack, rather than in us-east-1.
const requestOutput = await simAws
  .region("eu-west-2")
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "example.test" }),
  );

await simAws.backgroundTasksComplete();

try {
  await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "site-distribution",
        Comment: "Site distribution",
        Enabled: true,
        Aliases: { Quantity: 1, Items: ["example.test"] },
        Origins: { Quantity: 0, Items: [] },
        DefaultCacheBehavior: {
          TargetOriginId: "origin",
          ViewerProtocolPolicy: "redirect-to-https",
        },
        ViewerCertificate: {
          ACMCertificateArn: requestOutput.CertificateArn,
          SSLSupportMethod: "sni-only",
        },
      },
    }),
  );
} catch (error) {
  // InvalidViewerCertificate: ... is in eu-west-2, but CloudFront only accepts
  // ACM Certificates in us-east-1
  console.log((error as Error).message);
}
