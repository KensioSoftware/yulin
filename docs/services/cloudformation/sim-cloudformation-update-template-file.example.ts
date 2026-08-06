/**
 * Applying a synthesized template file to the stack it was deployed as.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const templatePath = path.join(
  process.cwd(),
  "cdk.out",
  "TestStack.template.json",
);

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplateFile({ templatePath });

// Something synthesizes the stack again here.

await simAws.cloudFormation().updateTemplateFile({ templatePath });
