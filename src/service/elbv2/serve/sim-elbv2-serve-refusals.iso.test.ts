import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

describe("What a sim ELBv2 load balancer will not carry a request through", () => {
  it("refuses a listener forwarding to an ip target group", async () => {
    // Given a load balancer with a listener
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();

    // And that listener forwarding to a group of addresses
    const addresses = await elbV2.createTargetGroup({
      input: {
        Name: "web-tg",
        TargetType: "ip",
        Protocol: "HTTP",
        Port: 8080,
      },
    });
    await elbV2.modifyListener({
      input: {
        ListenerArn: elbV2.findListenerOnPort(loadBalancer.arn, 80)?.arn,
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: addresses.TargetGroups?.[0]?.TargetGroupArn,
          },
        ],
      },
    });

    // When a request reaches it
    const request = simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then there is nothing listening on an address here for it to reach
    await expect(request).rejects.toThrow("holds ip targets");
  });

  it("refuses a listener forwarding to several target groups by weight", async () => {
    // Given a load balancer with a listener, and a second target group
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();
    const checkout = await elbV2.describeTargetGroups({ input: {} });
    const refunds = await elbV2.createTargetGroup({
      input: { Name: "refunds-tg", TargetType: "lambda" },
    });

    // And that listener forwarding to both of them
    await elbV2.modifyListener({
      input: {
        ListenerArn: elbV2.findListenerOnPort(loadBalancer.arn, 80)?.arn,
        DefaultActions: [
          {
            Type: "forward",
            ForwardConfig: {
              TargetGroups: [
                {
                  TargetGroupArn: checkout.TargetGroups?.[0]?.TargetGroupArn,
                  Weight: 1,
                },
                {
                  TargetGroupArn: refunds.TargetGroups?.[0]?.TargetGroupArn,
                  Weight: 1,
                },
              ],
            },
          },
        ],
      },
    });

    // When a request reaches it
    const request = simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then which group takes it is a question the weights answer, and nothing
    // here reads them
    await expect(request).rejects.toThrow(
      "Weighted forwarding is not simulated",
    );
  });

  it("names the rule holding a forward it cannot carry out", async () => {
    // Given a load balancer with a second target group
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();
    const checkout = await elbV2.describeTargetGroups({ input: {} });
    const refunds = await elbV2.createTargetGroup({
      input: { Name: "refunds-tg", TargetType: "lambda" },
    });

    // And a rule forwarding to both of them by weight
    const created = await elbV2.createRule({
      input: {
        ListenerArn: elbV2.findListenerOnPort(loadBalancer.arn, 80)?.arn,
        Priority: 10,
        Conditions: [{ Field: "path-pattern", Values: ["/web/*"] }],
        Actions: [
          {
            Type: "forward",
            ForwardConfig: {
              TargetGroups: [
                {
                  TargetGroupArn: checkout.TargetGroups?.[0]?.TargetGroupArn,
                  Weight: 1,
                },
                {
                  TargetGroupArn: refunds.TargetGroups?.[0]?.TargetGroupArn,
                  Weight: 1,
                },
              ],
            },
          },
        ],
      },
    });

    // When a request the rule claims reaches it
    const request = simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/web/index.html`,
    );

    // Then the refusal names the rule holding the action, which is what a
    // reader has to go and change, rather than only the listener it is on
    await expect(request).rejects.toThrow(
      `Rule ${created.Rules?.[0]?.RuleArn ?? ""} forwards to 2 target groups`,
    );
  });
});
