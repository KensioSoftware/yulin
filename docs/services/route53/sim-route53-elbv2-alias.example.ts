/**
 * Resolving a name to a simulated load balancer, over HTTP and over DNS.
 */

import { Resolver } from "node:dns/promises";

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const created = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: created.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "200",
          ContentType: "text/plain",
          MessageBody: "orders",
        },
      },
    ],
  }),
);

const zone = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "shop-zone",
  }),
);

// A CNAME below the apex reaches a load balancer as an alias record does.
await simAws.route53().changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zone.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: created.LoadBalancers?.[0]?.DNSName }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl("http://api.example.test/orders"));

  console.log(await response.text()); // "orders"

  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

  console.log(await resolver.resolve4("api.example.test")); // [ '127.0.0.1' ]
} finally {
  await srv.close();
}
