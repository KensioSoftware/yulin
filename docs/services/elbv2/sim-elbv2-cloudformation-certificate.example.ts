/**
 * An HTTPS listener holding a certificate the same stack created.
 */

import { DescribeListenersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "shop",
  template: {
    Resources: {
      ShopZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "shop.example.test",
          ValidationMethod: "DNS",
        },
      },
      ShopAlb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: { Name: "shop-alb" },
      },
      HttpsListener: {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: { Ref: "ShopAlb" },
          Protocol: "HTTPS",
          Port: 443,
          Certificates: [{ CertificateArn: { Ref: "SiteCertificate" } }],
          DefaultActions: [
            {
              Type: "fixed-response",
              FixedResponseConfig: {
                StatusCode: "200",
                ContentType: "text/plain",
                MessageBody: "shop",
              },
            },
          ],
        },
      },
      ShopRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "ShopZone" },
          Name: "shop.example.test",
          Type: "A",
          AliasTarget: {
            DNSName: { "Fn::GetAtt": ["ShopAlb", "DNSName"] },
            HostedZoneId: {
              "Fn::GetAtt": ["ShopAlb", "CanonicalHostedZoneID"],
            },
          },
        },
      },
    },
    Outputs: {
      ListenerArn: { Value: { Ref: "HttpsListener" } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const listenerArn = stack.output("ListenerArn");

const described = await simAws
  .elbV2()
  .describeListeners(
    new DescribeListenersCommand({ ListenerArns: [listenerArn] }),
  );

const listener = described.Listeners?.[0];

console.log(listener?.Certificates[0]?.CertificateArn);
// the ARN of the certificate the stack created

console.log(listener?.SslPolicy); // "ELBSecurityPolicy-2016-08"
