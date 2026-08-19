import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

/** The ARN the CDK app pins, because the Stack that issues it is another one. */
const synthesizedCertificateArn =
  "arn:aws:acm:us-east-1:111122223333:certificate/11111111-2222-3333-4444-555555555555";

/** Put the ARN simulated ACM issued wherever the synthesized one is named. */
function withSimulatedCertificate(
  template: CfnTemplateBodyRecord,
  certificateArn: string,
): CfnTemplateBodyRecord {
  return JSON.parse(
    JSON.stringify(template).replaceAll(
      synthesizedCertificateArn,
      () => certificateArn,
    ),
  ) as CfnTemplateBodyRecord;
}

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["DnsStack", "SiteStack"],
  stackOptions: {
    SiteStack: {
      transform: (template, deployed): CfnTemplateBodyRecord =>
        withSimulatedCertificate(
          template,
          deployed.get("DnsStack")?.output("SiteCertificateArn") ?? "",
        ),
    },
  },
});

console.log(stacks.get("SiteStack")?.stackName);
