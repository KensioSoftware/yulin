import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("CloudWatch Logs CloudFormation LogGroup tags", () => {
  it("tags a log group it creates and one a function already made", async () => {
    // Given a function's log group that already holds an event
    const simAws = new SimAws();
    simAws.logs().serviceWriter().write("/aws/lambda/orders", "one", ["ran"]);

    // When a template declares that group and a new one, both tagged
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          FunctionLogs: {
            Type: "AWS::Logs::LogGroup",
            Properties: {
              LogGroupName: "/aws/lambda/orders",
              Tags: [{ Key: "team", Value: "orders" }],
            },
          },
          AppLogs: {
            Type: "AWS::Logs::LogGroup",
            Properties: {
              LogGroupName: "/orders/app",
              Tags: [{ Key: "team", Value: "orders" }],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then both groups hold the tags
    for (const name of ["/aws/lambda/orders", "/orders/app"]) {
      assertObjectEquals(
        simAws.logs().findLogGroup(name)?.tags.record() ?? {},
        { team: "orders" },
      );
    }
  });
});
