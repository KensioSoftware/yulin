/**
 * A Role allowed to describe load balancers but not to create one.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateLoadBalancerCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { SimElbV2AccessDeniedException } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const account = simAws.account("888888888888");
const elbV2 = account.region("eu-west-1").elbV2();

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ReadOnlyRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await account.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReadOnlyRole",
    PolicyName: "describe-only",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "elasticloadbalancing:DescribeLoadBalancers",
        Resource: "*",
      },
    }),
  }),
);

const caller = {
  kind: "arn",
  arn: "arn:aws:iam::888888888888:role/ReadOnlyRole",
} as const;

const described = await elbV2.describeLoadBalancers(
  new DescribeLoadBalancersCommand({}),
  { caller },
);

console.log(described.LoadBalancers?.length); // 0

try {
  await elbV2.createLoadBalancer(
    new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    { caller },
  );
} catch (error) {
  console.log(error instanceof SimElbV2AccessDeniedException); // true
}
