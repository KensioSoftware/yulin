/**
 * Deploying every Stack a synthesized CDK cloud assembly holds.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws
  .cloudFormation()
  .deployCdkOut(path.join(process.cwd(), "cdk.out"));

const siteStack = stacks.get("SiteStack");
const dnsStack = stacks.get("DnsStack");

console.log(siteStack?.getResource("SiteBucket")?.simResource);
console.log(dnsStack?.getResource("SiteRecord")?.simResource);
