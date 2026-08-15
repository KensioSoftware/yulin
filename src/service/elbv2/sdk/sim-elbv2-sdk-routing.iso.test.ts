import {
  AddListenerCertificatesCommand,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteListenerCommand,
  DeleteLoadBalancerCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DeregisterTargetsCommand,
  DescribeListenerCertificatesCommand,
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeRulesCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  ModifyListenerCommand,
  ModifyRuleCommand,
  ModifyTargetGroupCommand,
  RegisterTargetsCommand,
  RemoveListenerCertificatesCommand,
  SetRulePrioritiesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSdk } from "../../../sdk/index.js";
import { createFixtureCertificate } from "../sim-elbv2.fixture.js";

const functionArn = "arn:aws:lambda:eu-west-2:888888888888:function:checkout";

describe("ELBv2 SDK interception", () => {
  it("routes an intercepted ElasticLoadBalancingV2Client to the simulation", async () => {
    // Given an intercepted ELBv2 SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(ElasticLoadBalancingV2Client);

    const client = new ElasticLoadBalancingV2Client({ region: "eu-west-2" });

    // When ordinary SDK code creates a load balancer and reads it back.
    const created = await client.send(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );
    const described = await client.send(
      new DescribeLoadBalancersCommand({ Names: ["shop-alb"] }),
    );

    // Then it reached the simulation, in the client's own Region.
    assertArrayLength(created.LoadBalancers, 1);
    assertNonNullable(created.LoadBalancers[0].DNSName);
    assertStringIncludes(
      created.LoadBalancers[0].DNSName,
      "shop-alb-0000000001.eu-west-2.elb.amazonaws.com",
    );
    assertArrayLength(described.LoadBalancers, 1);
  });

  it("routes every command simulated ELBv2 handles", async () => {
    // Given an intercepted client with a load balancer and a target group.
    using simSdk = new SimSdk();
    simSdk.intercept(ElasticLoadBalancingV2Client);

    const client = new ElasticLoadBalancingV2Client({ region: "eu-west-2" });
    const acm = simSdk.simAws.region("eu-west-2").acm();
    const shopCertificateArn = await createFixtureCertificate(
      simSdk.simAws,
      acm,
    );
    const adminCertificateArn = await createFixtureCertificate(
      simSdk.simAws,
      acm,
      "admin.example.com",
    );

    const loadBalancer = await client.send(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );
    const targetGroup = await client.send(
      new CreateTargetGroupCommand({
        Name: "checkout-tg",
        TargetType: "lambda",
      }),
    );

    assertArrayLength(loadBalancer.LoadBalancers, 1);
    assertArrayLength(targetGroup.TargetGroups, 1);

    const loadBalancerArn = loadBalancer.LoadBalancers[0].LoadBalancerArn;
    const targetGroupArn = targetGroup.TargetGroups[0].TargetGroupArn;
    assertNonNullable(loadBalancerArn);
    assertNonNullable(targetGroupArn);

    // When every other command is sent through the client.
    const listener = await client.send(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTP",
        Port: 80,
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );
    assertArrayLength(listener.Listeners, 1);

    const listenerArn = listener.Listeners[0].ListenerArn;
    assertNonNullable(listenerArn);

    const rule = await client.send(
      new CreateRuleCommand({
        ListenerArn: listenerArn,
        Priority: 10,
        Conditions: [{ Field: "host-header", Values: ["shop.example.com"] }],
        Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );
    assertArrayLength(rule.Rules, 1);

    const ruleArn = rule.Rules[0].RuleArn;
    assertNonNullable(ruleArn);

    await client.send(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: functionArn }],
      }),
    );
    const health = await client.send(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );
    await client.send(
      new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: functionArn }],
      }),
    );
    await client.send(
      new ModifyTargetGroupCommand({
        TargetGroupArn: targetGroupArn,
        HealthCheckEnabled: true,
      }),
    );
    await client.send(
      new DescribeTargetGroupsCommand({ TargetGroupArns: [targetGroupArn] }),
    );
    await client.send(
      new ModifyListenerCommand({ ListenerArn: listenerArn, Port: 8080 }),
    );
    await client.send(
      new DescribeListenersCommand({ ListenerArns: [listenerArn] }),
    );
    await client.send(
      new ModifyRuleCommand({
        RuleArn: ruleArn,
        Actions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: { StatusCode: "204" },
          },
        ],
      }),
    );
    await client.send(
      new SetRulePrioritiesCommand({
        RulePriorities: [{ RuleArn: ruleArn, Priority: 20 }],
      }),
    );
    const rules = await client.send(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    );

    const https = await client.send(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: shopCertificateArn }],
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );
    assertArrayLength(https.Listeners, 1);

    const httpsListenerArn = https.Listeners[0].ListenerArn;
    assertNonNullable(httpsListenerArn);

    await client.send(
      new AddListenerCertificatesCommand({
        ListenerArn: httpsListenerArn,
        Certificates: [{ CertificateArn: adminCertificateArn }],
      }),
    );
    const certificates = await client.send(
      new DescribeListenerCertificatesCommand({
        ListenerArn: httpsListenerArn,
      }),
    );
    await client.send(
      new RemoveListenerCertificatesCommand({
        ListenerArn: httpsListenerArn,
        Certificates: [{ CertificateArn: adminCertificateArn }],
      }),
    );
    await client.send(
      new DeleteListenerCommand({ ListenerArn: httpsListenerArn }),
    );

    await client.send(new DeleteRuleCommand({ RuleArn: ruleArn }));
    await client.send(new DeleteListenerCommand({ ListenerArn: listenerArn }));
    await client.send(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
    );
    await client.send(
      new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }),
    );

    const remaining = await client.send(new DescribeLoadBalancersCommand({}));

    // Then every command simulated ELBv2 knows about was one of them.
    assertArrayLength(
      new SimAws().elbV2().sdkCommandRouter().supportedCommandNames(),
      22,
    );

    // Then each one reached the simulation and the stack was torn down.
    assertArrayLength(health.TargetHealthDescriptions, 1);
    assertArrayLength(certificates.Certificates, 2);
    assertArrayLength(rules.Rules, 2);
    assertIdentical(rules.Rules[0].Priority, "20");
    assertArrayLength(remaining.LoadBalancers, 0);
  });
});
