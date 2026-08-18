import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["SiteStack", "DnsStack"],
});

console.log(stacks.keys().toArray());
