import {
  DeregisterTargetsCommand,
  DescribeTargetHealthCommand,
  RegisterTargetsCommand,
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
import {
  SimElbV2InvalidTargetException,
  SimElbV2TargetGroupNotFoundException,
  SimElbV2TooManyTargetsException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import {
  createFixtureIpTargetGroup,
  createFixtureLambdaTargetGroup,
  fixtureFunctionArn,
} from "../../sim-elbv2.fixture.js";

describe("ELBv2 RegisterTargetsCommand", () => {
  it("registers one function in a lambda target group", async () => {
    // Given a lambda target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    // When a function is registered.
    await elbV2.registerTargets(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: fixtureFunctionArn }],
      }),
    );

    // Then the function is the group's one target, reported as healthy.
    const output = await elbV2.describeTargetHealth(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );

    assertArrayLength(output.TargetHealthDescriptions, 1);
    assertIdentical(
      output.TargetHealthDescriptions[0].Target.Id,
      fixtureFunctionArn,
    );
    assertIdentical(
      output.TargetHealthDescriptions[0].TargetHealth.State,
      "healthy",
    );
  });

  it("refuses a second function in a lambda target group", async () => {
    // Given a lambda target group holding a function.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    await elbV2.registerTargets(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: fixtureFunctionArn }],
      }),
    );

    // When another is registered.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [
            {
              Id: "arn:aws:lambda:eu-west-1:888888888888:function:other",
            },
          ],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2TooManyTargetsException);

    // Then it is refused, as real ELB takes exactly one.
    assertStringIncludes(error.message, "it holds at most 1");
  });

  it("refuses a target the group's type will not take", async () => {
    // Given one target group of each type.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const lambdaGroup = await createFixtureLambdaTargetGroup(elbV2);
    const ipGroup = await createFixtureIpTargetGroup(elbV2);

    // When each is given the other's kind of target.
    const address = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: lambdaGroup,
          Targets: [{ Id: "10.0.1.5" }],
        }),
      );
    });

    assertInstanceOf(address, SimElbV2InvalidTargetException);

    const functionArn = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: ipGroup,
          Targets: [{ Id: fixtureFunctionArn }],
        }),
      );
    });

    assertInstanceOf(functionArn, SimElbV2InvalidTargetException);

    // Then both are refused by the group's own target type.
    assertStringIncludes(address.message, "not a Lambda function ARN");
    assertStringIncludes(functionArn.message, "not an IP address");
  });

  it("refuses a port on a function target", async () => {
    // Given a lambda target group.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    // When a function is registered with a port.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [{ Id: fixtureFunctionArn, Port: 443 }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidTargetException);

    // Then it is refused, as a function is invoked rather than connected to.
    assertStringIncludes(error.message, "cannot carry a Port");
  });

  it("gives an address target the group's port when it names none", async () => {
    // Given an ip target group listening on 8080.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureIpTargetGroup(elbV2);

    // When two addresses are registered, one with its own port.
    await elbV2.registerTargets(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [
          { Id: "10.0.1.5" },
          { Id: "10.0.1.6", Port: 9090, AvailabilityZone: "all" },
          { Id: "2001:db8::1" },
        ],
      }),
    );

    // Then the one that named none took the group's port.
    const output = await elbV2.describeTargetHealth(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );

    assertArrayLength(output.TargetHealthDescriptions, 3);
    assertIdentical(output.TargetHealthDescriptions[0].Target.Port, 8080);
    assertIdentical(output.TargetHealthDescriptions[1].Target.Port, 9090);
    assertIdentical(
      output.TargetHealthDescriptions[1].Target.AvailabilityZone,
      "all",
    );
  });

  it("takes targets out again, and ignores one that was never in", async () => {
    // Given an ip target group holding two addresses.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureIpTargetGroup(elbV2);

    await elbV2.registerTargets(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.1.5" }, { Id: "10.0.1.6" }],
      }),
    );

    // When one of them and one that was never there are deregistered.
    await elbV2.deregisterTargets(
      new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.1.5" }, { Id: "10.0.9.9" }],
      }),
    );

    // Then the other is left, and the one that was never there was no error.
    const output = await elbV2.describeTargetHealth(
      new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
    );

    assertArrayLength(output.TargetHealthDescriptions, 1);
    assertIdentical(output.TargetHealthDescriptions[0].Target.Id, "10.0.1.6");
  });

  it("answers about the targets a health describe names", async () => {
    // Given an ip target group holding one address.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureIpTargetGroup(elbV2);

    await elbV2.registerTargets(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.1.5" }],
      }),
    );

    // When it is asked about, and then an address that is not registered.
    const registered = await elbV2.describeTargetHealth(
      new DescribeTargetHealthCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: "10.0.1.5", Port: 8080 }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeTargetHealth(
        new DescribeTargetHealthCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [{ Id: "10.0.9.9" }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidTargetException);

    // Then the registered one is answered and the other is refused.
    assertArrayLength(registered.TargetHealthDescriptions, 1);
    assertStringIncludes(error.message, "not registered");
  });

  it("refuses a request with no target group or no targets", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const targetGroupArn = await createFixtureIpTargetGroup(elbV2);

    // When requests leave out what they have to name.
    const noGroup = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets({ input: {} });
    });

    assertInstanceOf(noGroup, SimElbV2ValidationError);

    const noTargets = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [],
        }),
      );
    });

    assertInstanceOf(noTargets, SimElbV2ValidationError);

    const noId = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: [{ Id: "" }],
        }),
      );
    });

    assertInstanceOf(noId, SimElbV2ValidationError);

    const deregisterNoGroup = await assertThrowsErrorAsync(async () => {
      await elbV2.deregisterTargets({ input: {} });
    });

    assertInstanceOf(deregisterNoGroup, SimElbV2ValidationError);

    const deregisterNoTargets = await assertThrowsErrorAsync(async () => {
      await elbV2.deregisterTargets({
        input: { TargetGroupArn: targetGroupArn },
      });
    });

    assertInstanceOf(deregisterNoTargets, SimElbV2ValidationError);

    const healthNoGroup = await assertThrowsErrorAsync(async () => {
      await elbV2.describeTargetHealth({ input: {} });
    });

    assertInstanceOf(healthNoGroup, SimElbV2ValidationError);

    // Then each is refused.
    assertStringIncludes(noGroup.message, "TargetGroupArn is required");
    assertStringIncludes(noTargets.message, "at least one target");
    assertStringIncludes(noId.message, "requires an Id");
    assertStringIncludes(deregisterNoGroup.message, "TargetGroupArn");
    assertStringIncludes(deregisterNoTargets.message, "at least one target");
    assertStringIncludes(healthNoGroup.message, "TargetGroupArn");
  });

  it("refuses targets for a target group that does not exist", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When targets are registered against an unknown ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.registerTargets(
        new RegisterTargetsCommand({
          TargetGroupArn: "arn:missing",
          Targets: [{ Id: "10.0.1.5" }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2TargetGroupNotFoundException);

    // Then it is refused.
    assertStringIncludes(error.message, "arn:missing");
  });
});
