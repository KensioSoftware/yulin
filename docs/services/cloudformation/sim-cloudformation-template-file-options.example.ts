import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplateFile({
  templatePath: path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  stackName: "local-cdk-stack",
});

await stack.waitForDeployComplete();
