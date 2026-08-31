import { CreateTargetGroupCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayEmpty,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2DuplicateTargetGroupNameException,
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";

describe("ELBv2 CreateTargetGroupCommand", () => {
  it("creates a lambda target group with no protocol or port", async () => {
    // Given simulated ELBv2 in a known account and region.
    const simAws = new SimAws();
    const elbV2 = simAws.account("555555555555").region("eu-west-1").elbV2();

    // When a target group holding a function is created.
    const output = await elbV2.createTargetGroup(
      new CreateTargetGroupCommand({
        Name: "checkout-tg",
        TargetType: "lambda",
      }),
    );

    // Then it has a real-shaped ARN and health checking is off, as on real ELB.
    const targetGroup = output.TargetGroups?.[0];
    assertNonNullable(targetGroup);
    assertIdentical(
      targetGroup.TargetGroupArn,
      "arn:aws:elasticloadbalancing:eu-west-1:555555555555:targetgroup/" +
        "checkout-tg/0000000000000001",
    );
    assertIdentical(targetGroup.TargetType, "lambda");
    assertUndefined(targetGroup.Protocol);
    assertFalse(targetGroup.HealthCheckEnabled);
    assertArrayEmpty(targetGroup.LoadBalancerArns);
  });

  it("creates an ip target group with the protocol and port a target is reached on", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a target group holding addresses is created.
    const output = await elbV2.createTargetGroup(
      new CreateTargetGroupCommand({
        Name: "web-tg",
        TargetType: "ip",
        Protocol: "HTTP",
        Port: 8080,
        VpcId: "vpc-1",
        HealthCheckPath: "/healthz",
      }),
    );

    // Then it carries them, and the health check settings it was given.
    const targetGroup = output.TargetGroups?.[0];
    assertNonNullable(targetGroup);
    assertIdentical(targetGroup.TargetType, "ip");
    assertIdentical(targetGroup.Protocol, "HTTP");
    assertIdentical(targetGroup.Port, 8080);
    assertIdentical(targetGroup.VpcId, "vpc-1");
    assertTrue(targetGroup.HealthCheckEnabled);
    assertIdentical(targetGroup.HealthCheckPath, "/healthz");
  });

  it("refuses an instance target group rather than accepting and ignoring it", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a target group of instances is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "web-tg",
          TargetType: "instance",
          Protocol: "HTTP",
          Port: 80,
        }),
      );
    });

    assertInstanceOf(error, SimElbV2UnsimulatedInputException);

    // Then it is refused, since there are no instances here to route to.
    assertStringIncludes(error.message, "not simulated");
    assertStringIncludes(error.message, "lambda and ip");
  });

  it("refuses a target group that names no target type", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a target group is created without one.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "web-tg",
          Protocol: "HTTP",
          Port: 80,
        }),
      );
    });

    assertInstanceOf(error, SimElbV2UnsimulatedInputException);

    // Then it is refused rather than defaulted to the type real ELB defaults to.
    assertStringIncludes(error.message, "instance");
  });

  it("refuses a lambda target group given a protocol or port", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a function target group is given somewhere to connect to.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "checkout-tg",
          TargetType: "lambda",
          Protocol: "HTTP",
          Port: 80,
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused, as a function is invoked rather than connected to.
    assertStringIncludes(error.message, "no Protocol or Port");
  });

  it("refuses an ip target group with nowhere to reach a target", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When an address target group is created without a port.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "web-tg",
          TargetType: "ip",
          Protocol: "HTTP",
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused.
    assertStringIncludes(error.message, "requires a Protocol and a Port");
  });

  it("refuses a protocol only a network load balancer speaks", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a TCP target group is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "web-tg",
          TargetType: "ip",
          Protocol: "TCP",
          Port: 80,
        }),
      );
    });

    assertInstanceOf(error, SimElbV2UnsimulatedInputException);

    // Then it is refused.
    assertStringIncludes(error.message, "Application Load Balancer");
  });

  it("refuses a protocol that is not an ELB protocol at all", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a target group names something that is not an ELB protocol.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup({
        input: {
          Name: "web-tg",
          TargetType: "ip",
          Protocol: "FTP",
          Port: 21,
        },
      });
    });

    // Then it is a validation failure rather than something unsimulated: the
    // request is wrong, not beyond what this goes as far as.
    assertInstanceOf(error, SimElbV2ValidationError);
    assertStringIncludes(error.message, "not a valid ELB protocol");
  });

  it("refuses a port outside the range, and a duplicate name", async () => {
    // Given a target group that already exists.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    await elbV2.createTargetGroup(
      new CreateTargetGroupCommand({
        Name: "web-tg",
        TargetType: "ip",
        Protocol: "HTTP",
        Port: 8080,
      }),
    );

    // When an impossible port and a repeated name are used.
    const port = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "other-tg",
          TargetType: "ip",
          Protocol: "HTTP",
          Port: 70_000,
        }),
      );
    });

    assertInstanceOf(port, SimElbV2ValidationError);

    const duplicate = await assertThrowsErrorAsync(async () => {
      await elbV2.createTargetGroup(
        new CreateTargetGroupCommand({
          Name: "web-tg",
          TargetType: "lambda",
        }),
      );
    });

    assertInstanceOf(duplicate, SimElbV2DuplicateTargetGroupNameException);

    // Then both are refused.
    assertStringIncludes(port.message, "port between 1 and 65535");
    assertStringIncludes(duplicate.message, "already exists");
  });
});
