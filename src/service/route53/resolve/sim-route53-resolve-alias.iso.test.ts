import { assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53 } from "../sim-route53.js";
import { simRoute53LocalName } from "../local-name/sim-route53-local-name.js";

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

  async function createAliasRecord(properties: {
    readonly simAws: SimAws;
    readonly simRoute53: SimRoute53;
    readonly hostedZoneId: SimRoute53HostedZoneId;
    readonly name: string;
    readonly type: "A" | "AAAA";
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
                Type: properties.type,
                AliasTarget: {
                  DNSName: properties.value,
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      },
    });

    await properties.simAws.backgroundTasksComplete();
  }

  it("resolves an apex A alias to a CloudFront distribution hostname", async () => {
    // Given a hosted zone with an apex A alias pointing at a CloudFront hostname.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneId = await createHostedZone(simRoute53, "example.com");

    await createAliasRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "example.com",
      type: "A",
      value: "EDFDVBD6EXAMPLE.cloudfront.net",
    });

    // When the local apex hostname is resolved through Route53.
    const target = simRoute53.resolveHttpHost(
      simRoute53LocalName("example.com"),
    );

    // Then it routes to the CloudFront distribution.
    assertObjectMatches(target, {
      service: "cloudFront",
      resourceName: "edfdvbd6example",
    });
  });

  it("resolves an apex AAAA alias to a CloudFront distribution hostname", async () => {
    // Given a hosted zone with an apex AAAA alias pointing at a CloudFront hostname.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneId = await createHostedZone(simRoute53, "ipv6.example.com");

    await createAliasRecord({
      simAws,
      simRoute53,
      hostedZoneId,
      name: "ipv6.example.com",
      type: "AAAA",
      value: "EDFDVBD6EXAMPLE.cloudfront.net",
    });

    // When the local apex hostname is resolved through Route53.
    const target = simRoute53.resolveHttpHost(
      simRoute53LocalName("ipv6.example.com"),
    );

    // Then it routes to the CloudFront distribution.
    assertObjectMatches(target, {
      service: "cloudFront",
      resourceName: "edfdvbd6example",
    });
  });
});
