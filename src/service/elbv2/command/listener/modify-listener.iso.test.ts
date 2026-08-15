import {
  CreateListenerCommand,
  ModifyListenerCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimElbV2DuplicateListenerException } from "../../error/sim-elbv2.error.js";
import {
  createFixtureCertificate,
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
} from "../../sim-elbv2.fixture.js";

describe("ELBv2 ModifyListenerCommand", () => {
  it("changes only what a modify names", async () => {
    // Given an HTTP listener on port 80, and an issued certificate.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const certificateArn = await createFixtureCertificate(simAws);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
    );

    // When it is moved to HTTPS on 443 with a certificate in one request.
    const output = await elbV2.modifyListener(
      new ModifyListenerCommand({
        ListenerArn: listenerArn,
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: certificateArn }],
        DefaultActions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: { StatusCode: "404" },
          },
        ],
      }),
    );

    // Then the change took, and its default actions and certificate came with
    // it.
    assertArrayLength(output.Listeners, 1);

    const listener = output.Listeners[0];
    assertIdentical(listener.Protocol, "HTTPS");
    assertIdentical(listener.Port, 443);
    assertArrayLength(listener.Certificates, 1);
    assertIdentical(listener.Certificates[0].CertificateArn, certificateArn);
    assertArrayLength(listener.DefaultActions, 1);
    assertIdentical(listener.DefaultActions[0].Type, "fixed-response");
  });

  it("leaves a listener alone but for the one setting a modify names", async () => {
    // Given an HTTPS listener.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const certificateArn = await createFixtureCertificate(simAws);
    const created = await elbV2.createListener(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: certificateArn }],
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );

    assertArrayLength(created.Listeners, 1);

    const listenerArn = created.Listeners[0].ListenerArn;

    // When only the security policy is changed.
    const output = await elbV2.modifyListener(
      new ModifyListenerCommand({
        ListenerArn: listenerArn,
        SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      }),
    );

    // Then everything else stayed as it was.
    assertArrayLength(output.Listeners, 1);
    assertIdentical(
      output.Listeners[0].SslPolicy,
      "ELBSecurityPolicy-TLS13-1-2-2021-06",
    );
    assertIdentical(output.Listeners[0].Port, 443);
    assertIdentical(output.Listeners[0].Protocol, "HTTPS");
    assertArrayLength(output.Listeners[0].Certificates, 1);
    assertArrayLength(output.Listeners[0].DefaultActions, 1);
    assertIdentical(output.Listeners[0].DefaultActions[0].Type, "forward");
  });

  it("refuses a modify onto a port another listener holds", async () => {
    // Given two listeners on one load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
      80,
    );

    await createFixtureListener(elbV2, loadBalancerArn, targetGroupArn, 8080);

    // When the first is moved onto the second's port, and then onto its own.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.modifyListener(
        new ModifyListenerCommand({ ListenerArn: listenerArn, Port: 8080 }),
      );
    });

    assertInstanceOf(error, SimElbV2DuplicateListenerException);

    const unchanged = await elbV2.modifyListener(
      new ModifyListenerCommand({ ListenerArn: listenerArn, Port: 80 }),
    );

    // Then the clash is refused and staying put is not a clash with itself.
    assertStringIncludes(error.message, "port 8080");
    assertArrayLength(unchanged.Listeners, 1);
    assertIdentical(unchanged.Listeners[0].Port, 80);
  });
});
