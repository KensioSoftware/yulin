/**
 * Deploying a CDK Bucket event notification into simulated AWS.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The Account and Region the CDK app synthesized for.
const scope = simAws.account("111111111111").region("eu-west-2");

await scope
  .cloudFormation()
  .deployTemplateFile("cdk.out/TestStack.template.json");

await scope.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
