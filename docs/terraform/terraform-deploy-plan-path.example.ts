/**
 * Deploying a Terraform plan named by path alone.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { stack } = await new TerraformAdapter(simAws).deployPlan(
  "terraform/orders.tfplan.json",
);

console.log(stack.stackName);
