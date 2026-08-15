/**
 * The certificates a listener carries beyond its default one.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  AddListenerCertificatesCommand,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  DescribeListenerCertificatesCommand,
  RemoveListenerCertificatesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();
const elbV2 = simAws.elbV2();

async function issuedCertificateArn(domainName: string): Promise<string> {
  const requested = await acm.requestCertificate(
    new RequestCertificateCommand({ DomainName: domainName }),
  );

  await simAws.backgroundTasksComplete();

  return requested.CertificateArn ?? "";
}

const shop = await issuedCertificateArn("shop.example.com");
const admin = await issuedCertificateArn("admin.example.com");

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTPS",
    Port: 443,
    Certificates: [{ CertificateArn: shop }],
    DefaultActions: [
      {
        Type: "forward",
        TargetGroupArn: targetGroup.TargetGroups?.[0]?.TargetGroupArn,
      },
    ],
  }),
);

const listenerArn = listener.Listeners?.[0]?.ListenerArn;

await elbV2.addListenerCertificates(
  new AddListenerCertificatesCommand({
    ListenerArn: listenerArn,
    Certificates: [{ CertificateArn: admin }],
  }),
);

const carried = await elbV2.describeListenerCertificates(
  new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
);

// The default certificate comes first and is the only one flagged as such.
console.log(carried.Certificates?.map((each) => each.IsDefault)); // [true, false]

await elbV2.removeListenerCertificates(
  new RemoveListenerCertificatesCommand({
    ListenerArn: listenerArn,
    Certificates: [{ CertificateArn: admin }],
  }),
);
