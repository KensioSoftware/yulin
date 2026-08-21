/**
 * Deploying a Terraform plan into simulated AWS.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { stack } = await new TerraformAdapter(simAws).deployPlan({
  planPath: "terraform/orders.tfplan.json",
  bindings: [
    {
      functionName: "orders-processor",
      handler: (event: { orderId: string }): string => `took ${event.orderId}`,
    },
  ],
});

// The bucket, the table and the queue the configuration declared.
console.log(simAws.s3().getSimBucketByName("orders-uploads")?.bucketName);
console.log(simAws.dynamoDb().findTable("orders-orders")?.tableName);

console.log(stack.status);
