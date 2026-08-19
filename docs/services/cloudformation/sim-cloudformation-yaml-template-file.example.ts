/**
 * Deploying a hand-written YAML template file into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws
  .cloudFormation()
  .deployTemplateFile(
    path.join(process.cwd(), "infrastructure", "work-stack.yaml"),
  );

await stack.waitForDeployComplete();

console.log(stack.stackName); // "work-stack"
