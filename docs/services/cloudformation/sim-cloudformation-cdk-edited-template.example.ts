/**
 * Deploying a synthesized CDK template edited in memory.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { SimAws } from "@kensio/yulin";

const templatePath = path.join(
  process.cwd(),
  "cdk.out",
  "TestStack.template.json",
);

const synthesized = JSON.parse(await readFile(templatePath, "utf8")) as {
  Resources: Record<string, { Type: string }>;
};

const resources = Object.fromEntries(
  Object.entries(synthesized.Resources).filter(
    ([logicalId]) => logicalId !== "AnalyticsQueue",
  ),
);

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "local-cdk-stack",
  template: { ...synthesized, Resources: resources },
  templatePath,
});

await stack.waitForDeployComplete();
