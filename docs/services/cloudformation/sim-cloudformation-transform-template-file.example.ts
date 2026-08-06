/**
 * Adapting a synthesized template every time it is read.
 */

import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

const simAws = new SimAws();

/**
 * Drop the records pointing at a hosted zone that only exists in the real
 * account.
 */
function withoutDnsRecords(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  const resources = Object.fromEntries(
    Object.entries(template.Resources).filter(
      ([, resource]) =>
        (resource as { Type?: string }).Type !== "AWS::Route53::RecordSet",
    ),
  );

  return { ...template, Resources: resources };
}

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  transform: withoutDnsRecords,
  watch: true,
});
