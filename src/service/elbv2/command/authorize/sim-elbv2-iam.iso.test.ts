import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateLoadBalancerCommand,
  DeleteLoadBalancerCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
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
import { SimElbV2AccessDeniedException } from "../../error/sim-elbv2.error.js";

const accountId = "555555555555";
const roleArn = `arn:aws:iam::${accountId}:role/DeployRole`;

async function makeRole(simAws: SimAws, policy: object): Promise<void> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "DeployRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "DeployRole",
      PolicyName: "elb",
      PolicyDocument: JSON.stringify(policy),
    }),
  );
}

describe("ELBv2 IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given simulated ELBv2 with no caller named.
    const simAws = new SimAws();
    const elbV2 = simAws.account(accountId).region("eu-west-1").elbV2();

    // When a load balancer is created.
    const output = await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    );

    // Then IAM defaults to Account root and the request is allowed.
    assertArrayLength(output.LoadBalancers, 1);
    assertNonNullable(output.LoadBalancers[0].LoadBalancerArn);
  });

  it("refuses a caller whose policy does not allow the action", async () => {
    // Given a Role allowed to describe load balancers but not create them.
    const simAws = new SimAws();
    const elbV2 = simAws.account(accountId).region("eu-west-1").elbV2();

    await makeRole(simAws, {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "elasticloadbalancing:DescribeLoadBalancers",
        Resource: "*",
      },
    });

    const caller = { kind: "arn", arn: roleArn } as const;

    // When that Role describes and then creates.
    const described = await elbV2.describeLoadBalancers(
      new DescribeLoadBalancersCommand({}),
      { caller },
    );

    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.createLoadBalancer(
        new CreateLoadBalancerCommand({ Name: "shop-alb" }),
        { caller },
      );
    });

    assertInstanceOf(error, SimElbV2AccessDeniedException);

    // Then the describe is allowed and the create is refused by name.
    assertIdentical(described.LoadBalancers?.length, 0);
    assertStringIncludes(
      error.message,
      "elasticloadbalancing:CreateLoadBalancer",
    );
    assertStringIncludes(error.message, roleArn);
  });

  it("authorizes an operation against the ARN of the resource it names", async () => {
    // Given a Role allowed to delete only one load balancer.
    const simAws = new SimAws();
    const elbV2 = simAws.account(accountId).region("eu-west-1").elbV2();

    const allowed = await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "allowed-alb" }),
    );
    const refused = await elbV2.createLoadBalancer(
      new CreateLoadBalancerCommand({ Name: "refused-alb" }),
    );

    assertArrayLength(allowed.LoadBalancers, 1);
    assertArrayLength(refused.LoadBalancers, 1);

    const allowedArn = allowed.LoadBalancers[0].LoadBalancerArn;
    const refusedArn = refused.LoadBalancers[0].LoadBalancerArn;
    assertNonNullable(allowedArn);
    assertNonNullable(refusedArn);

    await makeRole(simAws, {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "elasticloadbalancing:DeleteLoadBalancer",
        Resource: allowedArn,
      },
    });

    const caller = { kind: "arn", arn: roleArn } as const;

    // When the Role deletes each of them.
    await elbV2.deleteLoadBalancer(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: allowedArn }),
      { caller },
    );

    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.deleteLoadBalancer(
        new DeleteLoadBalancerCommand({ LoadBalancerArn: refusedArn }),
        { caller },
      );
    });

    assertInstanceOf(error, SimElbV2AccessDeniedException);

    // Then only the one its policy names could be deleted.
    assertStringIncludes(error.message, refusedArn);
  });
});
