/**
 * An HTTPS listener presenting a certificate simulated ACM issued.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  type Action,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const certificate = await simAws
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "shop.example.com" }),
  );

// A certificate no hosted zone covers issues on its own, once the simulation's
// background work has run.
await simAws.backgroundTasksComplete();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const loadBalancerArn = loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn;
const forward: Action = {
  Type: "forward",
  TargetGroupArn: targetGroup.TargetGroups?.[0]?.TargetGroupArn,
};

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancerArn,
    Protocol: "HTTPS",
    Port: 443,
    Certificates: [{ CertificateArn: certificate.CertificateArn }],
    DefaultActions: [forward],
  }),
);

// A listener that named no security policy gets the one real ELB gives it.
console.log(listener.Listeners?.[0]?.SslPolicy); // "ELBSecurityPolicy-2016-08"

try {
  await elbV2.createListener(
    new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTPS",
      Port: 8443,
      Certificates: [
        {
          CertificateArn:
            "arn:aws:acm:us-east-1:888888888888:certificate/00000009",
        },
      ],
      DefaultActions: [forward],
    }),
  );
} catch (error) {
  // Certificate arn:aws:acm:us-east-1:888888888888:certificate/00000009 was
  // not found in simulated ACM
  console.log((error as Error).message);
}
