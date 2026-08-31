import {
  DeleteLoadBalancerCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayEmpty,
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
  SimElbV2LoadBalancerNotFoundException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import { createFixtureLoadBalancer } from "../../sim-elbv2.fixture.js";

describe("ELBv2 DescribeLoadBalancersCommand", () => {
  it("describes every load balancer when the request names none", async () => {
    // Given three load balancers.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    await createFixtureLoadBalancer(elbV2, "one-alb");
    await createFixtureLoadBalancer(elbV2, "two-alb");
    await createFixtureLoadBalancer(elbV2, "three-alb");

    // When they are described without being named.
    const output = await elbV2.describeLoadBalancers({ input: {} });

    // Then all three come back, in creation order.
    assertArrayLength(output.LoadBalancers, 3);
    assertIdentical(output.LoadBalancers[0].LoadBalancerName, "one-alb");
    assertUndefined(output.NextMarker);
  });

  it("describes load balancers by ARN and by name", async () => {
    // Given two load balancers.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const firstArn = await createFixtureLoadBalancer(elbV2, "one-alb");
    await createFixtureLoadBalancer(elbV2, "two-alb");

    // When one is described each way.
    const byArn = await elbV2.describeLoadBalancers(
      new DescribeLoadBalancersCommand({ LoadBalancerArns: [firstArn] }),
    );
    const byName = await elbV2.describeLoadBalancers(
      new DescribeLoadBalancersCommand({ Names: ["two-alb"] }),
    );

    // Then each answers with the one it named.
    assertArrayLength(byArn.LoadBalancers, 1);
    assertIdentical(byArn.LoadBalancers[0].LoadBalancerArn, firstArn);
    assertArrayLength(byName.LoadBalancers, 1);
    assertIdentical(byName.LoadBalancers[0].LoadBalancerName, "two-alb");
  });

  it("refuses a load balancer that does not exist rather than leaving it out", async () => {
    // Given no load balancers.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When one is described by name and another by ARN.
    const byName = await assertThrowsErrorAsync(async () => {
      await elbV2.describeLoadBalancers(
        new DescribeLoadBalancersCommand({ Names: ["missing-alb"] }),
      );
    });

    assertInstanceOf(byName, SimElbV2LoadBalancerNotFoundException);

    const byArn = await assertThrowsErrorAsync(async () => {
      await elbV2.describeLoadBalancers(
        new DescribeLoadBalancersCommand({ LoadBalancerArns: ["arn:missing"] }),
      );
    });

    assertInstanceOf(byArn, SimElbV2LoadBalancerNotFoundException);

    // Then each is refused.
    assertStringIncludes(byName.message, "missing-alb");
    assertStringIncludes(byArn.message, "arn:missing");
  });

  it("refuses a request naming load balancers two ways at once", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a describe carries both ARNs and names.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.describeLoadBalancers(
        new DescribeLoadBalancersCommand({
          LoadBalancerArns: ["arn:one"],
          Names: ["one-alb"],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2ValidationError);

    // Then it is refused, since the two could disagree.
    assertStringIncludes(error.message, "not both");
  });

  it("pages a describe with a page size and a marker", async () => {
    // Given three load balancers.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    await createFixtureLoadBalancer(elbV2, "one-alb");
    await createFixtureLoadBalancer(elbV2, "two-alb");
    await createFixtureLoadBalancer(elbV2, "three-alb");

    // When they are described two at a time.
    const first = await elbV2.describeLoadBalancers(
      new DescribeLoadBalancersCommand({ PageSize: 2 }),
    );
    const second = await elbV2.describeLoadBalancers(
      new DescribeLoadBalancersCommand({
        PageSize: 2,
        Marker: first.NextMarker,
      }),
    );

    // Then the marker reaches the rest and then runs out.
    assertArrayLength(first.LoadBalancers, 2);
    assertIdentical(first.NextMarker, "2");
    assertArrayLength(second.LoadBalancers, 1);
    assertUndefined(second.NextMarker);
  });

  it("refuses a page size or marker it could not have issued", async () => {
    // Given one load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    await createFixtureLoadBalancer(elbV2, "one-alb");

    // When an impossible page size and marker are asked for.
    const pageSize = await assertThrowsErrorAsync(async () => {
      await elbV2.describeLoadBalancers(
        new DescribeLoadBalancersCommand({ PageSize: 0 }),
      );
    });

    assertInstanceOf(pageSize, SimElbV2ValidationError);

    const marker = await assertThrowsErrorAsync(async () => {
      await elbV2.describeLoadBalancers(
        new DescribeLoadBalancersCommand({ Marker: "9" }),
      );
    });

    assertInstanceOf(marker, SimElbV2ValidationError);

    // Then both are refused.
    assertStringIncludes(pageSize.message, "PageSize");
    assertStringIncludes(marker.message, "Marker");
  });

  it("forgets a deleted load balancer", async () => {
    // Given a load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const arn = await createFixtureLoadBalancer(elbV2, "one-alb");

    // When it is deleted.
    await elbV2.deleteLoadBalancer(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: arn }),
    );

    // Then nothing is left to describe.
    const output = await elbV2.describeLoadBalancers({ input: {} });
    assertArrayEmpty(output.LoadBalancers);
  });

  it("refuses a delete naming no load balancer, or one that is gone", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();

    // When a delete carries no ARN, and then an unknown one.
    const missingArn = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteLoadBalancer({ input: {} });
    });

    assertInstanceOf(missingArn, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteLoadBalancer(
        new DeleteLoadBalancerCommand({ LoadBalancerArn: "arn:missing" }),
      );
    });

    assertInstanceOf(unknown, SimElbV2LoadBalancerNotFoundException);

    // Then both are refused.
    assertStringIncludes(missingArn.message, "LoadBalancerArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });
});
