import { assertObjectMatches, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2LoadBalancer } from "../../elbv2/load-balancer/sim-elbv2-load-balancer.js";
import { simElbV2LambdaTargetFactory } from "../../elbv2/serve/sim-elbv2-lambda-target.factory.js";
import { simRoute53LocalName } from "../local-name/sim-route53-local-name.js";

/**
 * A hosted zone for `example.test`, and its id.
 */
async function createZone(simAws: SimAws): Promise<string> {
  const creation = await simAws.route53().createHostedZone({
    input: { Name: "example.test", CallerReference: "elbv2-zone" },
  });

  await simAws.backgroundTasksComplete();

  return creation.HostedZone?.Id ?? "";
}

/**
 * Point a name at a load balancer with an alias A record, as a stack does.
 */
async function createAlias(
  simAws: SimAws,
  name: string,
  dnsName: string,
): Promise<void> {
  await simAws.route53().changeResourceRecordSets({
    input: {
      HostedZoneId: await createZone(simAws),
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: name,
              Type: "A",
              AliasTarget: {
                DNSName: dnsName,
                HostedZoneId: "Z0000000000000",
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

/**
 * A load balancer that answers, whose DNS name a record can point at.
 */
async function makeLoadBalancer(simAws: SimAws): Promise<SimElbV2LoadBalancer> {
  return await simElbV2LambdaTargetFactory.make({}, simAws);
}

describe("Resolving a name to a sim ELBv2 load balancer", () => {
  it("resolves a load balancer DNS name to the load balancer", async () => {
    // Given a load balancer
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);

    // When its own DNS name is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName(loadBalancer.dnsName));

    // Then it names the load balancer, in the Region its host name carries
    assertObjectMatches(target, {
      service: "elbV2",
      resourceName: loadBalancer.dnsName,
      regionName: "us-east-1",
    });
  });

  it("resolves an alias record to the load balancer it points at", async () => {
    // Given a hosted zone with an alias record pointing at a load balancer
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await createAlias(simAws, "api.example.test", loadBalancer.dnsName);

    // When the record's name is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("api.example.test"));

    // Then it routes to the load balancer the alias names
    assertObjectMatches(target, {
      service: "elbV2",
      resourceName: loadBalancer.dnsName,
    });
  });

  it("resolves a CNAME record to the load balancer it points at", async () => {
    // Given a hosted zone with a CNAME pointing at a load balancer, which is
    // how a name below the apex reaches one without an alias
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    const hostedZoneId = await createZone(simAws);

    await simAws.route53().changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.test",
                Type: "CNAME",
                TTL: 300,
                ResourceRecords: [{ Value: loadBalancer.dnsName }],
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // When the record's name is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("www.example.test"));

    // Then it routes to the same load balancer the alias would have
    assertObjectMatches(target, {
      service: "elbV2",
      resourceName: loadBalancer.dnsName,
    });
  });

  it("resolves a name pointing at a load balancer that has been deleted", async () => {
    // Given an alias record whose load balancer has since been deleted
    const simAws = new SimAws();
    const loadBalancer = await makeLoadBalancer(simAws);
    await createAlias(simAws, "api.example.test", loadBalancer.dnsName);
    await simAws
      .elbV2()
      .deleteLoadBalancer({ input: { LoadBalancerArn: loadBalancer.arn } });

    // When the record's name is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("api.example.test"));

    // Then the name still names a load balancer, because the shape of the host
    // name is what says so. Whether one still answers on it is settled when the
    // request is routed, which is what makes a deleted load balancer a refusal
    // naming the host name rather than an unknown host.
    assertObjectMatches(target, {
      service: "elbV2",
      resourceName: loadBalancer.dnsName,
    });
  });

  it("resolves nothing for a name of another shape under the ELB domain", async () => {
    // Given a record pointing at a host name that is not one ELB issues
    const simAws = new SimAws();
    await createAlias(
      simAws,
      "api.example.test",
      "shop-alb-0000000001.elb.amazonaws.com",
    );

    // When the record's name is resolved
    const target = simAws
      .route53()
      .resolveHttpHost(simRoute53LocalName("api.example.test"));

    // Then nothing simulated owns it, rather than a load balancer being
    // assumed behind any name under the AWS domain
    assertUndefined(target);
  });
});
