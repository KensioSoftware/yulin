/**
 * A SAM function put on a timer by its Schedule event.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const runs: string[] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reconciliation-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Reconcile: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Hourly: {
              Type: "Schedule",
              Properties: {
                Schedule: "rate(1 hour)",
                Input: JSON.stringify({ ledger: "rates" }),
              },
            },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Reconcile",
      handler: (event: { ledger: string }): string => {
        runs.push(event.ledger);

        return "reconciled";
      },
    },
  ],
});

await stack.waitForDeployComplete();

await simAws.clock().advanceBy({ hours: 3 });

console.log(runs);
