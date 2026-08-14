import { CreateLoadBalancerCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2DuplicateLoadBalancerNameException,
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";

describe("ELBv2 CreateLoadBalancerCommand", () => {
  it("creates an internet-facing load balancer with a real-shaped DNS name", async () => {
    // Given simulated ELBv2 in a known account and region.
    const simAws = new SimAws();
    const elbV2 = simAws.account("555555555555").region("eu-west-1").elbV2();

    // When a load balancer is created.
    const output = await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );

    // Then it reports an ARN, a DNS name, a scheme and an active state.
    assertArrayLength(output.LoadBalancers, 1);

    const loadBalancer = output.LoadBalancers[0];
    assertIdentical(
      loadBalancer.LoadBalancerArn,
      "arn:aws:elasticloadbalancing:eu-west-1:555555555555:loadbalancer/app/" +
        "shop-alb/0000000000000001",
    );
    assertIdentical(
      loadBalancer.DNSName,
      "shop-alb-0000000001.eu-west-1.elb.amazonaws.com",
    );
    assertIdentical(loadBalancer.Scheme, "internet-facing");
    assertIdentical(loadBalancer.Type, "application");
    assertIdentical(loadBalancer.State.Code, "active");
    assertIdentical(loadBalancer.IpAddressType, "ipv4");
    assertNonNullable(loadBalancer.CanonicalHostedZoneId);
  });

  it("prefixes the DNS name of an internal load balancer", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.account().region("us-east-1").elbV2();

    // When an internal load balancer is created.
    const output = await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({
        Name: "private-alb",
        Scheme: "internal",
        IpAddressType: "dualstack",
        Subnets: ["subnet-1", "subnet-2"],
        SecurityGroups: ["sg-1"],
        Tags: [{ Key: "team", Value: "shop" }],
      }),
    );

    // Then its host name carries the prefix real ELB gives an internal one.
    assertArrayLength(output.LoadBalancers, 1);

    const loadBalancer = output.LoadBalancers[0];
    assertStringIncludes(loadBalancer.DNSName, "internal-private-alb-");
    assertIdentical(loadBalancer.Scheme, "internal");
    assertIdentical(loadBalancer.IpAddressType, "dualstack");
  });

  it("refuses a second load balancer of the same name", async () => {
    // Given a load balancer that already exists.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );

    // When another is created with the same name.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createLoadBalancer(
        new CreateLoadBalancerCommand({ Name: "shop-alb" }),
      );
    });

    assertInstanceOf(error, SimElbV2DuplicateLoadBalancerNameException);

    // Then it is refused, as a name is unique within an account and region.
    assertStringIncludes(error.message, "already exists");
  });

  it("refuses a name real ELB would not take", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When names outside the rules are used, including none at all.
    const names = [
      undefined,
      "",
      "-shop",
      "shop-",
      "shop_alb",
      "internal-shop",
      "a".repeat(33),
    ];
    const refusals = await Promise.all(
      names.map(
        async (name) =>
          await assertThrowsErrorAsync(async () => {
            await elbV2.createLoadBalancer(
              new CreateLoadBalancerCommand({ Name: name }),
            );
          }),
      ),
    );

    // Then each one is refused rather than trimmed or adjusted.
    assertArrayLength(refusals, names.length);

    for (const refusal of refusals) {
      assertInstanceOf(refusal, SimElbV2ValidationError);
    }

    assertStringIncludes(refusals[0].message, "required");
    assertStringIncludes(refusals[5].message, "internal-");
  });

  it("refuses a scheme or address type it does not have", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When an unknown scheme and an unknown address type are asked for.
    const scheme = await assertThrowsErrorAsync(async () => {
      await elbV2.createLoadBalancer({
        input: { Name: "shop-alb", Scheme: "public" },
      });
    });

    assertInstanceOf(scheme, SimElbV2ValidationError);

    const addressType = await assertThrowsErrorAsync(async () => {
      await elbV2.createLoadBalancer({
        input: { Name: "shop-alb", IpAddressType: "ipv6" },
      });
    });

    assertInstanceOf(addressType, SimElbV2ValidationError);

    // Then both are refused.
    assertStringIncludes(scheme.message, "not valid");
    assertStringIncludes(addressType.message, "not valid");
  });

  it("refuses a network load balancer rather than making an application one", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a network load balancer is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createLoadBalancer(
        new CreateLoadBalancerCommand({ Name: "shop-nlb", Type: "network" }),
      );
    });

    assertInstanceOf(error, SimElbV2UnsimulatedInputException);

    // Then it is refused, because nothing here routes below HTTP.
    assertStringIncludes(error.message, "not simulated");
  });

  it("keeps load balancers apart by account and region", async () => {
    // Given the same name created in two regions.
    const simAws = new SimAws();
    const first = simAws.account("111111111111").region("eu-west-1").elbV2();
    const second = simAws.account("111111111111").region("us-east-1").elbV2();

    const firstOutput = await first.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );
    const secondOutput = await second.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );

    // Then each has its own ARN and neither sees the other.
    assertArrayLength(firstOutput.LoadBalancers, 1);
    assertArrayLength(secondOutput.LoadBalancers, 1);
    assertStringIncludes(
      firstOutput.LoadBalancers[0].LoadBalancerArn,
      "eu-west-1",
    );
    assertStringIncludes(
      secondOutput.LoadBalancers[0].LoadBalancerArn,
      "us-east-1",
    );
    assertNonNullable(second.findLoadBalancerByName("shop-alb"));
  });
});
