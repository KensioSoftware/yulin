/**
 * Resolving a simulated Route53 record with Node's DNS resolver.
 */

import { Resolver } from "node:dns/promises";

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();

const zone = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "resolver-zone",
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zone.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.example.test",
            Type: "A",
            TTL: 60,
            ResourceRecords: [{ Value: "192.0.2.10" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

try {
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

  const addresses = await resolver.resolve4("api.example.test");

  console.log(addresses); // [ '192.0.2.10' ]
} finally {
  await srv.close();
}
