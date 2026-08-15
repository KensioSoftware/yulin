import {
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simCfnElbV2Output } from "./sim-cfn-elbv2.fixture.js";

const functionArn = "arn:aws:lambda:us-east-1:123456789012:function:checkout";

const targetGroupTemplate = {
  Resources: {
    CheckoutTargets: {
      Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
      Properties: {
        Name: "checkout-tg",
        TargetType: "lambda",
        Targets: [{ Id: functionArn }],
      },
    },
  },
  Outputs: {
    Arn: { Value: { Ref: "CheckoutTargets" } },
    FullName: {
      Value: { "Fn::GetAtt": ["CheckoutTargets", "TargetGroupFullName"] },
    },
    Name: { Value: { "Fn::GetAtt": ["CheckoutTargets", "TargetGroupName"] } },
    AlsoArn: {
      Value: { "Fn::GetAtt": ["CheckoutTargets", "TargetGroupArn"] },
    },
  },
};

describe("AWS::ElasticLoadBalancingV2::TargetGroup", () => {
  it("creates a target group and registers the targets declared", async () => {
    // Given a template declaring a lambda target group holding one function.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: targetGroupTemplate,
    });

    await stack.waitForDeployComplete();

    // Then the group exists with the target already registered, so it routes
    // as soon as the stack has deployed.
    const command = new DescribeTargetHealthCommand({
      TargetGroupArn: simCfnElbV2Output(stack, "Arn"),
    });
    const health = await simAws.elbV2().describeTargetHealth(command);

    assertArrayLength(health.TargetHealthDescriptions, 1);
    assertIdentical(health.TargetHealthDescriptions[0].Target.Id, functionArn);
    assertIdentical(
      health.TargetHealthDescriptions[0].TargetHealth.State,
      "healthy",
    );

    await simAws.backgroundTasksComplete();
  });

  it("answers Ref and the ARN attribute with the same ARN", async () => {
    // Given a deployed target group.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: targetGroupTemplate,
    });

    await stack.waitForDeployComplete();

    // Then Ref, TargetGroupArn, TargetGroupName and TargetGroupFullName each
    // answer with what the group holds.
    const arn = simCfnElbV2Output(stack, "Arn");

    assertIdentical(simCfnElbV2Output(stack, "AlsoArn"), arn);
    assertIdentical(simCfnElbV2Output(stack, "Name"), "checkout-tg");

    const fullName = simCfnElbV2Output(stack, "FullName");
    assertStringIncludes(fullName, "targetgroup/checkout-tg/");
    assertStringEndsWith(arn, fullName);

    await simAws.backgroundTasksComplete();
  });

  it("holds the health check settings the template declared", async () => {
    // Given a template declaring an ip target group with health checking.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          WebTargets: {
            Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
            Properties: {
              Name: "web-tg",
              TargetType: "ip",
              Protocol: "HTTP",
              Port: "8080",
              VpcId: "vpc-1111",
              HealthCheckEnabled: "true",
              HealthCheckPath: "/healthz",
              HealthCheckIntervalSeconds: 15,
              HealthyThresholdCount: "3",
              Matcher: { HttpCode: "200-299" },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When it is described, then the settings are reported back, and the port
    // the template carried as a string reads as the number it spells.
    const described = await simAws
      .elbV2()
      .describeTargetGroups(
        new DescribeTargetGroupsCommand({ Names: ["web-tg"] }),
      );

    assertArrayLength(described.TargetGroups, 1);
    assertIdentical(described.TargetGroups[0].Port, 8080);
    assertIdentical(described.TargetGroups[0].HealthCheckPath, "/healthz");
    assertIdentical(described.TargetGroups[0].HealthCheckIntervalSeconds, 15);
    assertIdentical(described.TargetGroups[0].HealthyThresholdCount, 3);
    assertIdentical(described.TargetGroups[0].Matcher?.HttpCode, "200-299");

    await simAws.backgroundTasksComplete();
  });

  it("registers an address target on the port it declares", async () => {
    // Given a template declaring an ip target group with two targets, one of
    // them on its own port carried as a string.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          WebTargets: {
            Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
            Properties: {
              Name: "web-tg",
              TargetType: "ip",
              Protocol: "HTTP",
              Port: 80,
              Targets: [
                { Id: "10.0.0.1" },
                { Id: "10.0.0.2", Port: "8080", AvailabilityZone: "all" },
                { Id: "10.0.0.3", Port: 9090 },
              ],
            },
          },
        },
        Outputs: { Arn: { Value: { Ref: "WebTargets" } } },
      },
    });

    await stack.waitForDeployComplete();

    // Then all three are registered: the first takes the group's port, the
    // second the number its own string spelled, and the third its own number.
    const command = new DescribeTargetHealthCommand({
      TargetGroupArn: simCfnElbV2Output(stack, "Arn"),
    });
    const health = await simAws.elbV2().describeTargetHealth(command);

    assertArrayLength(health.TargetHealthDescriptions, 3);
    assertIdentical(health.TargetHealthDescriptions[0].Target.Port, 80);
    assertIdentical(health.TargetHealthDescriptions[1].Target.Port, 8080);
    assertIdentical(health.TargetHealthDescriptions[2].Target.Port, 9090);
    assertIdentical(
      health.TargetHealthDescriptions[1].Target.AvailabilityZone,
      "all",
    );

    await simAws.backgroundTasksComplete();
  });

  it("deploys a target group declaring attributes, without them", async () => {
    // Given a template declaring target group attributes, which change how a
    // real load balancer holds connections.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          CheckoutTargets: {
            Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
            Properties: {
              Name: "checkout-tg",
              TargetType: "lambda",
              TargetGroupAttributes: [
                { Key: "lambda.multi_value_headers.enabled", Value: "true" },
              ],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the group is created without them, and the record says why.
    const ignored = stack.resources.get("CheckoutTargets")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(ignored[0].reason, "invokes the target instead");

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed target group after the stack and logical ID", async () => {
    // Given a template declaring a target group without a name.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          Checkout: {
            Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
            Properties: { TargetType: "lambda" },
          },
        },
        Outputs: {
          Name: { Value: { "Fn::GetAtt": ["Checkout", "TargetGroupName"] } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it is named from the stack and the logical ID.
    assertIdentical(simCfnElbV2Output(stack, "Name"), "shop-stack-Checkout");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a target Id that is not a string", async () => {
    // Given a template whose target Id is an object rather than an address.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the entry.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            CheckoutTargets: {
              Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
              Properties: {
                Name: "checkout-tg",
                TargetType: "lambda",
                Targets: [{ Id: { Arn: functionArn } }],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Targets entry 0 Id is a string");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a target Port that is not a number", async () => {
    // Given a template whose target Port is a word.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the entry.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            WebTargets: {
              Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
              Properties: {
                Name: "web-tg",
                TargetType: "ip",
                Protocol: "HTTP",
                Port: 80,
                Targets: [{ Id: "10.0.0.1", Port: "eighty" }],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Targets entry 0 Port is a number");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a Targets list that is not a list", async () => {
    // Given a template whose Targets is a single object.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            CheckoutTargets: {
              Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
              Properties: {
                Name: "checkout-tg",
                TargetType: "lambda",
                Targets: { Id: functionArn },
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Targets is a list");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a target group does not answer", async () => {
    // Given a template reading the load balancers forwarding to a group,
    // which nothing records on the group itself.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: {
          Resources: {
            CheckoutTargets: {
              Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
              Properties: { Name: "checkout-tg", TargetType: "lambda" },
            },
          },
          Outputs: {
            Arns: {
              Value: {
                "Fn::GetAtt": ["CheckoutTargets", "LoadBalancerArns"],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ElasticLoadBalancingV2::TargetGroup attribute " +
        "LoadBalancerArns",
    );

    await simAws.backgroundTasksComplete();
  });

  it("removes the target group when the stack is torn down", async () => {
    // Given a deployed target group.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: targetGroupTemplate,
    });

    await stack.waitForDeployComplete();

    const arn = simCfnElbV2Output(stack, "Arn");

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then the group has gone.
    assertUndefined(simAws.elbV2().findTargetGroupByArn(arn));
  });
});
