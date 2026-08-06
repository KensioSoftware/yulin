/**
 * Letting go of what an unserved environment is holding.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  watch: true,
});

// The Stack, and everything the template deployed, is still there afterwards.
await simAws.close();
