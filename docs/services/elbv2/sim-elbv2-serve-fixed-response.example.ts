/**
 * A health endpoint and an HTTP to HTTPS redirect, neither of which needs a
 * target group.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

// Nothing is registered behind this listener, and nothing needs to be: both
// actions are answered by the load balancer itself.
const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "redirect",
        RedirectConfig: {
          Protocol: "HTTPS",
          Port: "443",
          StatusCode: "HTTP_301",
        },
      },
    ],
  }),
);

await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "path-pattern", Values: ["/health"] }],
    Actions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "200",
          ContentType: "application/json",
          MessageBody: '{"ok":true}',
        },
      },
    ],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName ?? "";

const health = await simElbV2Fetch(simAws, `http://${dnsName}/health`);
console.log(health.status); // 200
console.log(await health.text()); // '{"ok":true}'

const redirected = await simElbV2Fetch(simAws, `http://${dnsName}/orders`, {
  headers: { host: "shop.example.com" },
});
console.log(redirected.status); // 301
console.log(redirected.headers.get("location"));
// "https://shop.example.com:443/orders"
