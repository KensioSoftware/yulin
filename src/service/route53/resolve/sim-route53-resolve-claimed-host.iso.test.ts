import { CreateDomainNameCommand } from "@aws-sdk/client-apigatewayv2";
import {
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertNonNullable,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import { simRoute53LocalName } from "../local-name/sim-route53-local-name.js";

const certificateArn =
  "arn:aws:acm:us-east-1:111111111111:certificate/6d2c7a2e-0c7a-4d4e-9b6c-1f0a2b3c4d5e";

const distributionHostname = "EDFDVBD6EXAMPLE.cloudfront.net";

/**
 * Point a hostname at a CloudFront distribution with an A alias, which is the
 * record a distribution serving a name of the project's own is reached by.
 */
async function aliasToDistribution(
  simAws: SimAws,
  hostname: string,
): Promise<void> {
  const simRoute53 = simAws.route53();
  const zone = await simRoute53.createHostedZone({
    input: { Name: "example.test", CallerReference: `${hostname}-test` },
  });
  const hostedZoneId = zone.HostedZone?.Id;
  assertIsSimRoute53HostedZoneId(hostedZoneId);

  await simRoute53.changeResourceRecordSets({
    input: {
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: hostname,
              Type: "A",
              AliasTarget: {
                DNSName: distributionHostname,
                HostedZoneId: "Z2FDTNDATAQYW2",
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    },
  });

  await simAws.backgroundTasksComplete();
}

describe("Resolving a hostname a simulated resource claimed", () => {
  it("resolves an API Gateway custom domain no record names", async () => {
    // Given a custom domain and no hosted zone at all
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "www.example.test" }),
      );

    // When the domain's own hostname is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("www.example.test"));

    // Then it reaches the domain, since nothing else says where the name goes
    assertObjectMatches(target, {
      service: "apiGatewayDomain",
      resourceName: "www.example.test",
    });
  });

  it("resolves the endpoint API Gateway issued the domain", async () => {
    // Given a custom domain
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "www.example.test" }),
      );
    const domain = simAws.apiGatewayV2().findDomainName("www.example.test");
    assertNonNullable(domain);

    // When its regional domain name is resolved, as it was answered and with
    // the AWS domain a record value keeps
    const target = simAws.route53().resolveHttpHost(domain.regionalDomainName);

    // Then that reaches the domain too, which is the published address a
    // CloudFront Origin reaches it by
    assertObjectMatches(target, {
      service: "apiGatewayDomain",
      resourceName: domain.hostnames[1],
    });
  });

  it("gives a record the hostname an API Gateway custom domain also holds", async () => {
    // Given a distribution serving a hostname through an alias record
    const simAws = new SimAws();
    await aliasToDistribution(simAws, "www.example.test");

    // When an HTTP API is given that hostname as a custom domain
    await simAws
      .apiGatewayV2()
      .createDomainName(
        new CreateDomainNameCommand({ DomainName: "www.example.test" }),
      );

    // Then the record still decides where the name goes, as it does on AWS,
    // where a custom domain name is reached only through a record
    assertObjectMatches(
      simAws.route53().resolveHttpHost(simRoute53LocalName("www.example.test")),
      { service: "cloudFront", resourceName: "edfdvbd6example" },
    );
  });

  it("keeps a Cognito hosted domain whatever a record says", async () => {
    // Given a user pool custom domain and a record for the same hostname
    const simAws = new SimAws();
    const { UserPool } = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "people" }));
    await simAws.cognitoIdentityProvider().createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: UserPool?.Id,
        Domain: "auth.example.test",
        CustomDomainConfig: { CertificateArn: certificateArn },
      }),
    );
    await aliasToDistribution(simAws, "auth.example.test");

    // When the hostname is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("auth.example.test"));

    // Then the pool still answers on it. Real Cognito puts a distribution in
    // front of a custom domain and expects a record pointing at that one,
    // which is a name nothing here serves, so the record a stack writes would
    // otherwise take the domain away from the pool it belongs to
    assertObjectMatches(target, { service: "cognitoIdentityProvider" });
  });

  it("names API Gateway for a domain endpoint no domain holds", () => {
    // Given a simulation with no custom domain at all
    const simAws = new SimAws();

    // When a domain endpoint hostname is resolved anyway
    const target = simAws
      .route53()
      .resolveHttpHost(
        simRoute53LocalName("d-abcdefghij.execute-api.us-east-1"),
      );

    // Then it names API Gateway, which is what the hostname says, and the
    // request is answered when nothing is found behind it
    assertObjectMatches(target, {
      service: "apiGatewayDomain",
      resourceName: "d-abcdefghij.execute-api.us-east-1",
    });
    assertUndefined(simAws.apiGatewayV2().findDomainName("d-abcdefghij"));
  });
});
