import { DescribeLoadBalancersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnElbV2Output } from "./sim-cfn-elbv2.fixture.js";

const loadBalancerTemplate = {
  Resources: {
    ShopAlb: {
      Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      Properties: {
        Name: "shop-alb",
        Scheme: "internet-facing",
        Type: "application",
        Tags: [{ Key: "Team", Value: "payments" }],
      },
    },
  },
  Outputs: {
    Arn: { Value: { Ref: "ShopAlb" } },
    AlsoArn: { Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerArn"] } },
    DnsName: { Value: { "Fn::GetAtt": ["ShopAlb", "DNSName"] } },
    FullName: { Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerFullName"] } },
    Name: { Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerName"] } },
    ZoneId: { Value: { "Fn::GetAtt": ["ShopAlb", "CanonicalHostedZoneID"] } },
  },
};

describe("AWS::ElasticLoadBalancingV2::LoadBalancer", () => {
  it("creates a simulated load balancer the template declares", async () => {
    // Given a template declaring a load balancer.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: loadBalancerTemplate,
    });

    await stack.waitForDeployComplete();

    // Then simulated ELBv2 holds it, Ref and the LoadBalancerArn attribute
    // both answer with its ARN, and the rest answer with what the load
    // balancer reports.
    const loadBalancer = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(loadBalancer);

    assertIdentical(simCfnElbV2Output(stack, "Arn"), loadBalancer.arn);
    assertIdentical(simCfnElbV2Output(stack, "AlsoArn"), loadBalancer.arn);
    assertIdentical(simCfnElbV2Output(stack, "DnsName"), loadBalancer.dnsName);
    assertIdentical(stack.outputs.get("Name")?.value, "shop-alb");
    assertIdentical(stack.outputs.get("ZoneId")?.value, "Z0000000000000");

    await simAws.backgroundTasksComplete();
  });

  it("answers LoadBalancerFullName with the ARN's own resource part", async () => {
    // Given a deployed load balancer.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: loadBalancerTemplate,
    });

    await stack.waitForDeployComplete();

    // Then the full name is the part of the ARN that names it, which is what
    // a CloudWatch metric dimension carries.
    const fullName = simCfnElbV2Output(stack, "FullName");
    assertStringIncludes(fullName, "app/shop-alb/");

    const loadBalancer = simAws.elbV2().findLoadBalancerByName("shop-alb");
    assertNonNullable(loadBalancer);
    assertStringEndsWith(loadBalancer.arn, fullName);

    await simAws.backgroundTasksComplete();
  });

  it("reports the scheme and address type the template declared", async () => {
    // Given a template declaring an internal load balancer on dualstack.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: {
            Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            Properties: {
              Name: "shop-alb",
              Scheme: "internal",
              IpAddressType: "dualstack",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When it is described, then both are reported, and an internal load
    // balancer's DNS name carries the prefix real ELB gives one.
    const described = await simAws
      .elbV2()
      .describeLoadBalancers(
        new DescribeLoadBalancersCommand({ Names: ["shop-alb"] }),
      );

    assertArrayLength(described.LoadBalancers, 1);
    assertIdentical(described.LoadBalancers[0].Scheme, "internal");
    assertIdentical(described.LoadBalancers[0].IpAddressType, "dualstack");
    assertStringIncludes(described.LoadBalancers[0].DNSName, "internal-");

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed load balancer after the stack and logical ID", async () => {
    // Given a template declaring a load balancer without a name, which real
    // CloudFormation would generate one for.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: { Type: "AWS::ElasticLoadBalancingV2::LoadBalancer" },
        },
        Outputs: {
          Name: { Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerName"] } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the name is the stack, the logical ID and a tail derived from both,
    // as real CloudFormation names one.
    const loadBalancerName = stack.outputs.get("Name")?.value;

    assertStringStartsWith(loadBalancerName, "shop-stack-ShopAlb-");
    assertNonNullable(simAws.elbV2().findLoadBalancerByName(loadBalancerName));

    await simAws.backgroundTasksComplete();
  });

  it("deploys a load balancer declaring subnets, without them", async () => {
    // Given a template declaring the network a load balancer sits on, which
    // there is none of here.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: {
            Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            Properties: {
              Name: "shop-alb",
              Subnets: ["subnet-1111", "subnet-2222"],
              SecurityGroups: ["sg-3333"],
              LoadBalancerAttributes: [
                { Key: "idle_timeout.timeout_seconds", Value: "120" },
              ],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it is created without them, and each is recorded so a reader can
    // see what the deployed load balancer is not doing.
    assertNonNullable(simAws.elbV2().findLoadBalancerByName("shop-alb"));

    const ignored = stack.getResource("ShopAlb")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 3);
    assertStringIncludes(
      ignored.map((property) => property.reason).join(" "),
      "there is no VPC here",
    );

    await simAws.backgroundTasksComplete();
  });

  it("records a property simulated ELBv2 knows nothing about", async () => {
    // Given a template declaring a property this simulation has no list entry
    // for at all.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ShopAlb: {
            Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            Properties: { Name: "shop-alb", SomethingNew: "yes" },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the load balancer is created without it, and the record says so.
    const ignored = stack.getResource("ShopAlb")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(
      ignored[0].reason,
      "not a property simulated ELBv2 knows about",
    );

    await simAws.backgroundTasksComplete();
  });

  it("fails the deployment for a network load balancer", async () => {
    // Given a template declaring a load balancer type this simulation refuses.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails saying why.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopNlb: {
              Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
              Properties: { Name: "shop-nlb", Type: "network" },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "is not simulated");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a name that is not a string", async () => {
    // Given a template whose Name is an object rather than a name.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the Resource and
    // the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopAlb: {
              Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
              Properties: { Name: { Value: "shop-alb" } },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "ShopAlb");
    assertStringIncludes(error.message, "Name is a string");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a load balancer does not answer", async () => {
    // Given a template reading the security groups a simulated load balancer
    // does not sit behind.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            ShopAlb: {
              Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
              Properties: { Name: "shop-alb" },
            },
          },
          Outputs: {
            Groups: { Value: { "Fn::GetAtt": ["ShopAlb", "SecurityGroups"] } },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ElasticLoadBalancingV2::LoadBalancer attribute " +
        "SecurityGroups",
    );

    await simAws.backgroundTasksComplete();
  });

  it("removes the load balancer when the stack is torn down", async () => {
    // Given a deployed load balancer.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: loadBalancerTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then nothing answers on it any more.
    assertUndefined(simAws.elbV2().findLoadBalancerByName("shop-alb"));
  });
});
