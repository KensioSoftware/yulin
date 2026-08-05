import { assertObjectMatches, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53 } from "../sim-route53.js";
import { simRoute53LocalName } from "../local-name/sim-route53-local-name.js";
import { makeAwsRegionName } from "../../aws/sim-aws-region.js";

describe("SimRoute53 hostname resolution", () => {
  async function createHostedZone(
    simRoute53: SimRoute53,
    name: string,
  ): Promise<SimRoute53HostedZoneId> {
    const hostedZoneCreation = await simRoute53.createHostedZone({
      input: {
        Name: name,
        CallerReference: `${name}-test`,
      },
    });

    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    return hostedZoneId;
  }

  async function createCnameRecord(properties: {
    readonly simAws: SimAws;
    readonly simRoute53: SimRoute53;
    readonly hostedZoneId: SimRoute53HostedZoneId;
    readonly name: string;
    readonly value: string;
  }): Promise<void> {
    await properties.simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: properties.hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: properties.name,
                Type: "CNAME",
                ResourceRecords: [{ Value: properties.value }],
              },
            },
          ],
        },
      },
    });

    await properties.simAws.backgroundTasksComplete();
  }

  it("returns undefined when no hosted zone holds the hostname", () => {
    // Given simulated AWS holding no hosted zones.
    const simAws = new SimAws();

    // When a hostname is resolved.
    const target = simAws.route53().resolveHttpHost("example.com");

    // Then no target is resolved.
    assertUndefined(target);
  });

  it("resolves a CNAME to an S3 website hostname with its target region", async () => {
    // Given a hosted zone with a CNAME pointing at a simulated S3 website hostname.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneId = await createHostedZone(simRoute53, "example.com");

    await createCnameRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "www.example.com",
      value: "site-bucket.s3-website.eu-west-1",
    });

    // When the local hostname is resolved through Route53.
    const target = simRoute53.resolveHttpHost(
      simRoute53LocalName("www.example.com"),
    );

    // Then Route53 identifies the S3 website service target and requested region.
    assertObjectMatches(target, {
      service: "s3",
      resourceName: "site-bucket",
      regionName: "eu-west-1",
    });
  });

  it("resolves a CNAME chain to an S3 website hostname", async () => {
    // Given a hosted zone with a multi-hop CNAME chain.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneId = await createHostedZone(
      simRoute53,
      "chain.example.com",
    );

    await createCnameRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "www.chain.example.com",
      value: "alias.chain.example.com",
    });
    await createCnameRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "alias.chain.example.com",
      value: "chain-bucket.s3-website.us-west-2",
    });

    // When the first hostname in the chain is resolved.
    const target = simRoute53.resolveHttpHost(
      simRoute53LocalName("www.chain.example.com"),
    );

    // Then the final S3 website target is returned.
    assertObjectMatches(target, {
      service: "s3",
      resourceName: "chain-bucket",
      regionName: "us-west-2",
    });
  });

  it("resolves a CNAME to a CloudFront distribution hostname", async () => {
    // Given a hosted zone with a CNAME pointing at a CloudFront hostname.
    const simAws = new SimAws();
    // Accessed via any region.
    const region = makeAwsRegionName();
    const simRoute53 = simAws.region(region).route53();
    const hostedZoneId = await createHostedZone(simRoute53, "cdn.example.com");

    await createCnameRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "assets.cdn.example.com",
      value: "EDFDVBD6EXAMPLE.cloudfront.net",
    });

    // When the local hostname is resolved through Route53.
    const target = simRoute53.resolveHttpHost(
      simRoute53LocalName("assets.cdn.example.com"),
    );

    // Then it routes to the CloudFront distribution.
    assertObjectMatches(target, {
      service: "cloudFront",
      resourceName: "edfdvbd6example",
    });
  });

  it("resolves records from another account's Route53 through the sim-wide DNS registry", async () => {
    // Given a hosted zone in a non-default account.
    const simAws = new SimAws();
    const accountRoute53 = simAws.account("111111111111").route53();
    const hostedZoneId = await createHostedZone(
      accountRoute53,
      "cross-account.example.com",
    );

    await createCnameRecord({
      simAws,
      simRoute53: accountRoute53,
      hostedZoneId,
      name: "www.cross-account.example.com",
      value: "cross-account-bucket.s3-website.ap-southeast-2",
    });

    // When the default account's Route53 resolves the same hostname.
    const defaultAccountTarget = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("www.cross-account.example.com"));

    // Then DNS-style resolution can find the record across accounts.
    assertObjectMatches(defaultAccountTarget, {
      service: "s3",
      resourceName: "cross-account-bucket",
      regionName: "ap-southeast-2",
    });
  });

  it("resolves account-scoped Route53 records to service targets without owning-account lookup", async () => {
    // Given a hosted zone in another account.
    const simAws = new SimAws();
    const accountRoute53 = simAws.account("222222222222").route53();
    const hostedZoneId = await createHostedZone(
      accountRoute53,
      "owned.example.com",
    );

    await createCnameRecord({
      simAws,
      simRoute53: accountRoute53,
      hostedZoneId,
      name: "www.owned.example.com",
      value: "owned-bucket.s3-website.eu-central-1",
    });

    // When the default account's Route53 resolves the hostname.
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("www.owned.example.com"));

    // Then Route53 only identifies the service target; S3 routing owns account lookup.
    assertObjectMatches(target, {
      service: "s3",
      resourceName: "owned-bucket",
      regionName: "eu-central-1",
    });
  });
});
