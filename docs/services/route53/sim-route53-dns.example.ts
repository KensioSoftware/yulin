/**
 * Querying simulated Route53 records with a DNS client.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "dns-zone",
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneCreation.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: "my-site.s3-website.eu-west-2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

console.log(`dig @127.0.0.1 -p ${srv.dnsPort} www.example.test`);
