/**
 * Deploying a synthesized CDK template file into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws
  .cloudFormation()
  .deployTemplateFile(
    path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  );

await stack.waitForDeployComplete();
