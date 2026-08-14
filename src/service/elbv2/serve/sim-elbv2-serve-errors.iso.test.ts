import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2Fetch } from "./sim-elbv2-fetch.js";
import { simElbV2LambdaTargetFactory } from "./sim-elbv2-lambda-target.factory.js";

/**
 * The ARN of the target group the factory creates.
 */
const targetGroupArn =
  "arn:aws:elasticloadbalancing:us-east-1:888888888888:targetgroup/checkout-tg/0000000000000001";

/**
 * Take the registered function out of the target group, leaving it empty.
 */
async function deregisterFunction(simAws: SimAws): Promise<void> {
  await simAws.elbV2().deregisterTargets({
    input: {
      TargetGroupArn: targetGroupArn,
      Targets: [
        { Id: "arn:aws:lambda:us-east-1:888888888888:function:checkout" },
      ],
    },
  });
}

describe("What a sim ELBv2 load balancer answers when a target fails", () => {
  it("answers 503 for a target group with nothing registered in it", async () => {
    // Given a load balancer whose function has been taken out of the target
    // group, leaving it empty
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await deregisterFunction(simAws);

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then there is no target to send it to, which is what real ELB answers
    // 503 for
    assertIdentical(response.status, 503);
    assertIdentical(response.statusText, "Service Unavailable");
  });

  it("answers 502 for a handler result with no status code", async () => {
    // Given a handler answering with a body and nothing else, which is what a
    // handler written for an API Gateway proxy integration returns
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      { handler: (): unknown => ({ body: "checkout" }) },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the load balancer answers 502 rather than passing the handler's
    // shape on to the client, as real ELB does
    assertIdentical(response.status, 502);
    assertIdentical(response.statusText, "Bad Gateway");
    expect(await response.text()).toContain("502 Bad Gateway");
  });

  it("answers 502 for a handler returning something that is not a result", async () => {
    // Given a handler answering with a bare string
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      { handler: (): unknown => "checkout" },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then there is no response in it, so the load balancer answers its own
    assertIdentical(response.status, 502);
  });

  it("answers 502 for a status code outside the range a response can hold", async () => {
    // Given a handler answering with a number that is not an HTTP status
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      { handler: (): unknown => ({ statusCode: 99, body: "checkout" }) },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then it is malformed for the same reason a missing one is
    assertIdentical(response.status, 502);
  });

  it("answers 502 when the handler throws", async () => {
    // Given a handler that fails
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => {
          throw new Error("no stock");
        },
      },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the error stays in the function's own logs, as it does on real ELB
    assertIdentical(response.status, 502);
  });

  it("answers 502 when the registered function is not there", async () => {
    // Given a target group naming a function that was never created
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();
    await deregisterFunction(simAws);
    await elbV2.registerTargets({
      input: {
        TargetGroupArn: targetGroupArn,
        Targets: [
          { Id: "arn:aws:lambda:us-east-1:888888888888:function:refunds" },
        ],
      },
    });

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the load balancer has a target and cannot invoke it
    assertIdentical(response.status, 502);
  });

  it("answers 502 for a target in another Account or Region", async () => {
    // Given a target group naming a function in another Region, which real ELB
    // refuses to register at all
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();
    await deregisterFunction(simAws);
    await elbV2.registerTargets({
      input: {
        TargetGroupArn: targetGroupArn,
        Targets: [
          { Id: "arn:aws:lambda:eu-west-1:888888888888:function:checkout" },
        ],
      },
    });

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the function is not looked for outside the target group's own
    // scope, so there is nothing to invoke
    assertIdentical(response.status, 502);
  });

  it("answers 502 for a target in another Account", async () => {
    // Given a target group naming a function in another Account, which real
    // ELB refuses to register at all
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    const elbV2 = simAws.elbV2();
    await deregisterFunction(simAws);
    await elbV2.registerTargets({
      input: {
        TargetGroupArn: targetGroupArn,
        Targets: [
          { Id: "arn:aws:lambda:us-east-1:222222222222:function:checkout" },
        ],
      },
    });

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the function is not looked for outside the target group's own
    // Account, so there is nothing to invoke
    assertIdentical(response.status, 502);
  });

  it("answers 413 for a request body larger than a function takes", async () => {
    // Given a load balancer with a Lambda target
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);

    // When a request carries more than the megabyte ELB sends on
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
      {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "x".repeat(1024 * 1024 + 1),
      },
    );

    // Then the load balancer refuses it rather than invoking the function
    assertIdentical(response.status, 413);
  });

  it("answers 502 for a response body larger than a function may return", async () => {
    // Given a handler answering with more than the megabyte ELB takes back
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => ({
          statusCode: 200,
          body: "x".repeat(1024 * 1024 + 1),
        }),
      },
      simAws,
    );

    // When a request reaches it
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the response is one ELB will not send
    assertIdentical(response.status, 502);
  });
});
