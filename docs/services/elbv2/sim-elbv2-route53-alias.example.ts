/**
 * Reaching a load balancer through the Route53 name pointing at it.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
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

const loadBalancerArn = created.LoadBalancers?.[0]?.LoadBalancerArn;
const dnsName = created.LoadBalancers?.[0]?.DNSName;

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "404",
          ContentType: "text/plain",
          MessageBody: "no such site",
        },
      },
    ],
  }),
);

// The rule matches on the name a client asks for, not on the load balancer's.
await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "host-header", Values: ["api.example.test"] }],
    Actions: [
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
              DNSName: dnsName,
              // The load balancer's CanonicalHostedZoneId, which sim Route53
              // does not resolve by.
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

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl("http://api.example.test/orders"));

  console.log(response.status); // 200
  console.log(await response.text()); // "orders"

  // The same name answers a DNS lookup with the address serving it.
  console.log(`dig @127.0.0.1 -p ${srv.dnsPort} api.example.test`);
} finally {
  await srv.close();
}
