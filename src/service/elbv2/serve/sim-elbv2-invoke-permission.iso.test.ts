import {
  AddPermissionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
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
 * Take the invoke permission the factory granted back off the function, so a
 * test states the grant it is about itself.
 */
async function revokeInvokePermission(simAws: SimAws): Promise<void> {
  await simAws.lambda().removePermission(
    new RemovePermissionCommand({
      FunctionName: "checkout",
      StatementId: "elb-invoke",
    }),
  );
}

describe("Invoking a sim ELBv2 target group's function", () => {
  it("refuses a function whose resource policy grants the load balancer nothing", async () => {
    // Given a target group whose function has no resource policy at all
    const simAws = new SimAws();
    let invocations = 0;
    const loadBalancer = await simElbV2LambdaTargetFactory.make(
      {
        handler: (): SimElbV2Result => {
          invocations += 1;
          return { statusCode: 200, body: "checkout" };
        },
      },
      simAws,
    );
    await revokeInvokePermission(simAws);

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the load balancer could not invoke the function and answers 502,
    // and the handler never ran
    assertResponseStatus(response, 502, await describeResponse(response));
    assertIdentical(invocations, 0);
  });

  it("serves the same request once the permission is granted", async () => {
    // Given the same target group, refused for want of the permission
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    const refused = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // When the function grants Elastic Load Balancing the invoke action for
    // this target group, which is the grant the ELB documentation writes
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "elb-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
        SourceArn: targetGroupArn,
      }),
    );
    const served = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the permission is the whole of the difference
    assertResponseStatus(refused, 502, await describeResponse(refused));
    assertResponseStatus(served, 200, await describeResponse(served));
    expect(await served.text()).toBe("checkout");
  });

  it("allows a permission granted with no source ARN", async () => {
    // Given a function granting the ELB service principal the invoke action
    // for anything
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "elb-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
      }),
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the unconditioned grant admits it
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("refuses a permission naming a different target group", async () => {
    // Given a grant for a target group other than the one forwarding here
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "elb-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
        SourceArn:
          "arn:aws:elasticloadbalancing:us-east-1:888888888888:targetgroup/refunds-tg/0000000000000009",
      }),
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the source ARN of the invocation does not match the grant, so a
    // permission written for one target group does not open another
    assertResponseStatus(response, 502, await describeResponse(response));
  });

  it("refuses a permission granted to a different service", async () => {
    // Given the grant an API Gateway integration needs, on an ELB target
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
      }),
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then a grant to another service principal is no grant to this one
    assertResponseStatus(response, 502, await describeResponse(response));
  });

  it("supplies the target group's Account as the source Account", async () => {
    // Given a grant conditioned on the Account the target group belongs to
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "elb-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
        SourceArn: targetGroupArn,
        SourceAccount: "888888888888",
      }),
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the confused deputy condition the ELB documentation recommends
    // matches, because the load balancer supplies it
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("refuses a permission conditioned on another Account", async () => {
    // Given the same grant naming an Account the target group is not in
    const simAws = new SimAws();
    const loadBalancer = await simElbV2LambdaTargetFactory.make({}, simAws);
    await revokeInvokePermission(simAws);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "checkout",
        StatementId: "elb-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "elasticloadbalancing.amazonaws.com",
        SourceArn: targetGroupArn,
        SourceAccount: "222222222222",
      }),
    );

    // When a request reaches the load balancer
    const response = await simElbV2Fetch(
      simAws,
      `http://${loadBalancer.dnsName}/orders`,
    );

    // Then the condition does not match what the load balancer supplied
    assertResponseStatus(response, 502, await describeResponse(response));
  });
});
