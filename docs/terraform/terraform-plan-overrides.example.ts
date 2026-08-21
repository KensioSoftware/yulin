/**
 * Supplying the values a Terraform plan could not carry.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { report } = await new TerraformAdapter(simAws).deployPlan({
  planPath: "terraform/orders.tfplan.json",
  bindings: [
    {
      functionName: "orders-processor",
      handler: (): string => process.env["QUEUE_URL"] ?? "",
    },
  ],
  overrides: [
    {
      functionName: "orders-processor",
      environment: {
        TABLE_NAME: "orders-orders",
        QUEUE_URL:
          "https://sqs.eu-west-1.amazonaws.com/123456789012/orders-processing",
      },
    },
    {
      roleName: "orders-processor",
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "sqs:ReceiveMessage",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
            ],
            Resource: "*",
          },
        ],
      },
    },
  ],
});

// The attributes the plan lost that no override covered.
console.log(report.lost);
