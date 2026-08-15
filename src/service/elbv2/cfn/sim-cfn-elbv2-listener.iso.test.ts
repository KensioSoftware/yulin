import { DescribeListenersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnElbV2Output } from "./sim-cfn-elbv2.fixture.js";

const loadBalancer = {
  Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
  Properties: { Name: "shop-alb" },
};

const notFound = {
  Type: "fixed-response",
  FixedResponseConfig: {
    StatusCode: "404",
    ContentType: "text/plain",
    MessageBody: "no such site",
  },
};

const listenerTemplate = {
  Resources: {
    ShopAlb: loadBalancer,
    HttpListener: {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "ShopAlb" },
        Protocol: "HTTP",
        Port: 80,
        DefaultActions: [notFound],
      },
    },
  },
  Outputs: {
    Arn: { Value: { Ref: "HttpListener" } },
    AlsoArn: { Value: { "Fn::GetAtt": ["HttpListener", "ListenerArn"] } },
  },
};

describe("AWS::ElasticLoadBalancingV2::Listener", () => {
  it("creates a listener on the load balancer the template names", async () => {
    // Given a template declaring a load balancer and an HTTP listener on it.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: listenerTemplate,
    });

    await stack.waitForDeployComplete();

    // Then the listener is on the load balancer's port 80, and Ref and the
    // ListenerArn attribute both answer with its ARN.
    const alb = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(alb);

    const listener = simAws.elbV2().findListenerOnPort(alb.arn, 80);
    assertNonNullable(listener);

    assertIdentical(simCfnElbV2Output(stack, "Arn"), listener.arn);
    assertIdentical(simCfnElbV2Output(stack, "AlsoArn"), listener.arn);

    await simAws.backgroundTasksComplete();
  });

  it("holds the default action the template declared", async () => {
    // Given a deployed listener whose default action is a fixed response.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: listenerTemplate,
    });

    await stack.waitForDeployComplete();

    // When the listener is described.
    const command = new DescribeListenersCommand({
      ListenerArns: [simCfnElbV2Output(stack, "Arn")],
    });
    const described = await simAws.elbV2().describeListeners(command);

    // Then the action is reported the way a listener created through the SDK
    // reports it, because it went through the same model.
    assertArrayLength(described.Listeners, 1);
    assertArrayLength(described.Listeners[0].DefaultActions, 1);
    assertIdentical(
      described.Listeners[0].DefaultActions[0].Type,
      "fixed-response",
    );
    assertIdentical(
      described.Listeners[0].DefaultActions[0].FixedResponseConfig?.StatusCode,
      "404",
    );

    await simAws.backgroundTasksComplete();
  });

  it("resolves a certificate an ACM Resource in the same stack created", async () => {
    // Given a template creating a certificate and attaching it to an HTTPS
    // listener.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: loadBalancer,
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "shop.example.test",
              ValidationMethod: "DNS",
            },
          },
          HttpsListener: {
            Type: "AWS::ElasticLoadBalancingV2::Listener",
            Properties: {
              LoadBalancerArn: { Ref: "ShopAlb" },
              Protocol: "HTTPS",
              Port: 443,
              Certificates: [{ CertificateArn: { Ref: "SiteCertificate" } }],
              DefaultActions: [notFound],
            },
          },
        },
        Outputs: {
          ListenerArn: { Value: { Ref: "HttpsListener" } },
          CertificateArn: { Value: { Ref: "SiteCertificate" } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the listener carries that certificate, and the security policy real
    // ELB defaults an HTTPS listener to.
    const command = new DescribeListenersCommand({
      ListenerArns: [simCfnElbV2Output(stack, "ListenerArn")],
    });
    const described = await simAws.elbV2().describeListeners(command);

    assertArrayLength(described.Listeners, 1);
    assertArrayLength(described.Listeners[0].Certificates, 1);
    assertIdentical(
      described.Listeners[0].Certificates[0].CertificateArn,
      simCfnElbV2Output(stack, "CertificateArn"),
    );
    assertStringStartsWith(
      described.Listeners[0].SslPolicy,
      "ELBSecurityPolicy",
    );

    await simAws.backgroundTasksComplete();
  });

  it("fails the deployment for a certificate simulated ACM does not hold", async () => {
    // Given an HTTPS listener naming a certificate ARN nothing issued.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails rather than leaving a
    // listener that could not serve.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopAlb: loadBalancer,
            HttpsListener: {
              Type: "AWS::ElasticLoadBalancingV2::Listener",
              Properties: {
                LoadBalancerArn: { Ref: "ShopAlb" },
                Protocol: "HTTPS",
                Port: 443,
                Certificates: [
                  {
                    CertificateArn:
                      "arn:aws:acm:us-east-1:888888888888:certificate/missing",
                  },
                ],
                DefaultActions: [notFound],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "was not found in simulated ACM");

    await simAws.backgroundTasksComplete();
  });

  it("deploys a listener declaring mutual authentication, without it", async () => {
    // Given a template declaring the parts of TLS this simulation performs
    // none of.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: loadBalancer,
          HttpListener: {
            Type: "AWS::ElasticLoadBalancingV2::Listener",
            Properties: {
              LoadBalancerArn: { Ref: "ShopAlb" },
              Protocol: "HTTP",
              Port: 80,
              DefaultActions: [notFound],
              MutualAuthentication: { Mode: "off" },
              ListenerAttributes: [
                {
                  Key: "routing.http.request.x_amzn_mtls_clientcert",
                  Value: "",
                },
              ],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the listener is created without them, and both are recorded.
    const ignored = stack.resources.get("HttpListener")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 2);
    assertStringIncludes(
      ignored.map((property) => property.reason).join(" "),
      "no TLS handshake happens here",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses a default action this simulation cannot carry out", async () => {
    // Given a listener whose default action authenticates against Cognito,
    // which nothing here performs.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails rather than leaving a
    // listener that would forward without authenticating.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopAlb: loadBalancer,
            HttpListener: {
              Type: "AWS::ElasticLoadBalancingV2::Listener",
              Properties: {
                LoadBalancerArn: { Ref: "ShopAlb" },
                Protocol: "HTTP",
                Port: 80,
                DefaultActions: [{ Type: "authenticate-cognito" }],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "authenticate-cognito");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a DefaultActions entry that is not an object", async () => {
    // Given a template whose default action is a bare word.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the entry.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopAlb: loadBalancer,
            HttpListener: {
              Type: "AWS::ElasticLoadBalancingV2::Listener",
              Properties: {
                LoadBalancerArn: { Ref: "ShopAlb" },
                Protocol: "HTTP",
                Port: 80,
                DefaultActions: ["forward"],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "DefaultActions entry 0 is an object");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a listener does not answer", async () => {
    // Given a template reading an attribute a listener has no answer for.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          ...listenerTemplate,
          Outputs: {
            Nonsense: { Value: { "Fn::GetAtt": ["HttpListener", "Port"] } },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ElasticLoadBalancingV2::Listener attribute Port",
    );

    await simAws.backgroundTasksComplete();
  });

  it("removes the listener when the stack is torn down", async () => {
    // Given a deployed listener.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: listenerTemplate,
    });

    await stack.waitForDeployComplete();

    const alb = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(alb);

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then nothing listens on the port any more.
    assertUndefined(simAws.elbV2().findListenerOnPort(alb.arn, 80));
  });
});
