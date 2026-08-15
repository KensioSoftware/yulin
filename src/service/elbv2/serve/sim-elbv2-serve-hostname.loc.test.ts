import { Resolver } from "node:dns/promises";

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  assertArrayEquals,
  assertIdentical,
  assertResponseStatus,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

/**
 * A load balancer whose target answers with the host name it was reached
 * under, and a hosted zone pointing `api.example.test` at it with an alias
 * record.
 */
async function makeAliasedLoadBalancer(
  simAws: SimAws,
): Promise<SimElbV2LoadBalancer> {
  const loadBalancer = await simElbV2LambdaTargetFactory.make(
    {
      handler: (event: SimElbV2Event): SimElbV2Result => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `orders for ${event.headers["host"] ?? ""}`,
      }),
    },
    simAws,
  );

  const zone = await simAws.route53().createHostedZone(
    new CreateHostedZoneCommand({
      Name: "example.test",
      CallerReference: "elbv2-serve-zone",
    }),
  );

  await simAws.route53().changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.HostedZone?.Id,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "api.example.test",
              Type: "A",
              AliasTarget: {
                DNSName: loadBalancer.dnsName,
                HostedZoneId: "Z0000000000000",
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    }),
  );

  await simAws.backgroundTasksComplete();

  return loadBalancer;
}

describe("Serving a sim ELBv2 load balancer on localhost", () => {
  it("carries a real localhost request to the load balancer the name aliases", async () => {
    // Given a load balancer a Route53 alias record points at
    const simAws = new SimAws();
    await makeAliasedLoadBalancer(simAws);

    // And the simulation served on localhost
    const srv = await serveSimAws({ simAws });

    try {
      // When the record's name is fetched over real localhost HTTP
      const response = await fetch(
        srv.localUrl("http://api.example.test/orders"),
      );

      // Then the load balancer's target handled the real HTTP request, seeing
      // the name it was made to rather than the localhost one it arrived at
      assertResponseStatus(response, 200);
      assertIdentical(await response.text(), "orders for api.example.test");
    } finally {
      await srv.close();
    }
  });

  it("answers a DNS lookup for the name with the local server address", async () => {
    // Given the same load balancer and alias record, served on localhost
    const simAws = new SimAws();
    await makeAliasedLoadBalancer(simAws);
    const srv = await serveSimAws({ simAws });

    try {
      // When a DNS client looks the record's name up
      const resolver = new Resolver({ timeout: 1000, tries: 1 });
      resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

      const addresses = await resolver.resolve4("api.example.test");

      // Then it answers with the address the local server listens on, so the
      // name a lookup returns is one an HTTP request actually reaches
      assertArrayEquals(addresses, ["127.0.0.1"]);
    } finally {
      await srv.close();
    }
  });
});
