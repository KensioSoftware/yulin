/**
 * Redirecting a simulated Route53 hostname with no server listening.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import {
  makeCffFunctionCodeInput,
  type CloudFrontFunction,
} from "@kensio/yulin/cloudfront";
import { SimAwsHttp } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();
const cloudFront = simAws.cloudFront();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "redirect-zone",
  }),
);

// CloudFront reads its certificate from us-east-1, wherever the rest of the
// stack lives.
const certificateRequest = await simAws
  .region("us-east-1")
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "www.example.test" }),
  );

await simAws
  .region("us-east-1")
  .acm()
  .completeDnsValidation(certificateRequest.CertificateArn);

function redirectToApex(
  event: CloudFrontFunction.ViewerRequestEvent,
): CloudFrontFunction.Response {
  const query = Object.entries(event.request.querystring)
    .map(([name, parameter]) => `${name}=${parameter.value}`)
    .join("&");

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: {
        value: `https://example.test${event.request.uri}${query.length > 0 ? `?${query}` : ""}`,
      },
    },
  };
}

const functionCreation = await cloudFront.createFunction(
  new CreateFunctionCommand({
    Name: "redirect-to-apex",
    FunctionConfig: {
      Comment: "Redirect www to the apex",
      Runtime: "cloudfront-js-2.0",
    },
    FunctionCode: makeCffFunctionCodeInput(redirectToApex),
  }),
);

const distributionCreation = await cloudFront.createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "redirect-distribution",
      Comment: "Apex redirect",
      Enabled: true,
      Aliases: { Quantity: 1, Items: ["www.example.test"] },
      // The Function answers every request, and the Origin goes unread.
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "apex-origin",
            DomainName: "origin.example.test",
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "http-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "apex-origin",
        ViewerProtocolPolicy: "redirect-to-https",
        FunctionAssociations: {
          Quantity: 1,
          Items: [
            {
              EventType: "viewer-request",
              FunctionARN: functionCreation.FunctionMetadata.FunctionARN,
            },
          ],
        },
      },
      ViewerCertificate: {
        ACMCertificateArn: certificateRequest.CertificateArn,
        SSLSupportMethod: "sni-only",
      },
    },
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneCreation.HostedZone!.Id!,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: distributionCreation.Distribution!.DomainName!,
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const http = new SimAwsHttp({ simAws });
const response = await http.fetch("https://www.example.test/docs/x?a=1");

console.log(response.status); // 301
console.log(response.headers.get("location")); // https://example.test/docs/x?a=1
