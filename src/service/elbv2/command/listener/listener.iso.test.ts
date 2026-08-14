import {
  CreateListenerCommand,
  DeleteListenerCommand,
  DescribeListenersCommand,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2DuplicateListenerException,
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2ListenerNotFoundException,
  SimElbV2TargetGroupNotFoundException,
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import {
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
  createFixtureRule,
} from "../../sim-elbv2.fixture.js";

const certificateArn =
  "arn:aws:acm:eu-west-1:888888888888:certificate/00000001";

describe("ELBv2 listeners", () => {
  it("creates an HTTP listener whose ARN is built from its load balancer's", async () => {
    // Given a load balancer and a target group.
    const simAws = new SimAws();
    const elbV2 = simAws.account("555555555555").region("eu-west-1").elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    // When a listener is created on it.
    const output = await elbV2.createListener(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTP",
        Port: 80,
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );

    // Then the ARN names the load balancer and the listener.
    assertArrayLength(output.Listeners, 1);

    const listener = output.Listeners[0];
    assertIdentical(
      listener.ListenerArn,
      "arn:aws:elasticloadbalancing:eu-west-1:555555555555:listener/app/" +
        "shop-alb/0000000000000001/0000000000000001",
    );
    assertIdentical(listener.Port, 80);
    assertUndefined(listener.SslPolicy);
    assertArrayLength(listener.DefaultActions, 1);
    assertIdentical(listener.DefaultActions[0].TargetGroupArn, targetGroupArn);
  });

  it("gives an HTTPS listener a security policy, and refuses one with no certificate", async () => {
    // Given a load balancer and a target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    // When an HTTPS listener is created with and without a certificate.
    const output = await elbV2.createListener(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: certificateArn }],
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createListener(
        new CreateListenerCommand({
          LoadBalancerArn: loadBalancerArn,
          Protocol: "HTTPS",
          Port: 8443,
          DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then the one with a certificate got a policy and the other was refused.
    assertArrayLength(output.Listeners, 1);
    assertIdentical(output.Listeners[0].SslPolicy, "ELBSecurityPolicy-2016-08");
    assertStringIncludes(error.message, "at least one certificate");
  });

  it("refuses a second listener on the same port", async () => {
    // Given a load balancer already listening on port 80.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    await createFixtureListener(elbV2, loadBalancerArn, targetGroupArn);

    // When another listener is created on the same port.
    const error = await assertThrowsErrorAsync(async () => {
      await createFixtureListener(elbV2, loadBalancerArn, targetGroupArn);
    });

    assertInstanceOf(error, SimElbV2DuplicateListenerException);

    // Then it is refused.
    assertStringIncludes(error.message, "port 80");
  });

  it("refuses a listener whose forward action names nothing that exists", async () => {
    // Given a load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);

    // When a listener forwards to a target group that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createListener(
        new CreateListenerCommand({
          LoadBalancerArn: loadBalancerArn,
          Protocol: "HTTP",
          Port: 80,
          DefaultActions: [{ Type: "forward", TargetGroupArn: "arn:missing" }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2TargetGroupNotFoundException);

    // Then it is refused when written rather than when a request arrives.
    assertStringIncludes(error.message, "arn:missing");
  });

  it("refuses a listener request that leaves out what it has to name", async () => {
    // Given a load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);

    // When requests leave out a load balancer, a port and a protocol.
    const noLoadBalancer = await assertThrowsErrorAsync(async () => {
      await elbV2.createListener({ input: {} });
    });

    assertInstanceOf(noLoadBalancer, SimElbV2ValidationError);

    const noPort = await assertThrowsErrorAsync(async () => {
      await elbV2.createListener({
        input: { LoadBalancerArn: loadBalancerArn, Protocol: "HTTP" },
      });
    });

    assertInstanceOf(noPort, SimElbV2ValidationError);

    const networkProtocol = await assertThrowsErrorAsync(async () => {
      await elbV2.createListener({
        input: {
          LoadBalancerArn: loadBalancerArn,
          Protocol: "TLS",
          Port: 443,
        },
      });
    });

    assertInstanceOf(networkProtocol, SimElbV2UnsimulatedInputException);

    // Then each is refused.
    assertStringIncludes(noLoadBalancer.message, "LoadBalancerArn is required");
    assertStringIncludes(noPort.message, "Protocol and a Port");
    assertStringIncludes(networkProtocol.message, "not simulated");
  });

  it("describes listeners by load balancer and by ARN, and refuses both at once", async () => {
    // Given a load balancer with one listener.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
    );

    // When it is described each way, and then both ways at once.
    const byLoadBalancer = await elbV2.describeListeners(
      new DescribeListenersCommand({ LoadBalancerArn: loadBalancerArn }),
    );
    const byArn = await elbV2.describeListeners(
      new DescribeListenersCommand({ ListenerArns: [listenerArn] }),
    );
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeListeners({ input: {} });
    });

    assertInstanceOf(error, SimElbV2ValidationError);

    // Then each way answers and naming neither is refused.
    assertArrayLength(byLoadBalancer.Listeners, 1);
    assertArrayLength(byArn.Listeners, 1);
    assertIdentical(byArn.Listeners[0].ListenerArn, listenerArn);
    assertStringIncludes(error.message, "either ListenerArns");
  });

  it("refuses a modify or delete naming no listener, or one that is gone", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a modify and a delete leave out the ARN, or name an unknown one.
    const noModifyArn = await assertThrowsErrorAsync(async () => {
      await elbV2.modifyListener({ input: {} });
    });

    assertInstanceOf(noModifyArn, SimElbV2ValidationError);

    const noDeleteArn = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteListener({ input: {} });
    });

    assertInstanceOf(noDeleteArn, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteListener(
        new DeleteListenerCommand({ ListenerArn: "arn:missing" }),
      );
    });

    assertInstanceOf(unknown, SimElbV2ListenerNotFoundException);

    // Then each is refused.
    assertStringIncludes(noModifyArn.message, "ListenerArn is required");
    assertStringIncludes(noDeleteArn.message, "ListenerArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });

  it("takes a listener's rules with it when it is deleted", async () => {
    // Given a listener with a rule on it.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
    );
    const ruleArn = await createFixtureRule(
      elbV2,
      listenerArn,
      10,
      targetGroupArn,
    );

    // When the listener is deleted.
    await elbV2.deleteListener(
      new DeleteListenerCommand({ ListenerArn: listenerArn }),
    );

    // Then its rule went with it.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeRules(
        new DescribeRulesCommand({ RuleArns: [ruleArn] }),
      );
    });

    assertInstanceOf(error, Error);

    assertStringIncludes(error.message, ruleArn);
  });
});
