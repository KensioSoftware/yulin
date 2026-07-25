/**
 * Simulated IAM Users, inline policies, and access keys.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

await simIam.createUser(
  new CreateUserCommand({
    UserName: "ApplicationUser",
    Path: "/application/",
  }),
);

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "ApplicationUser",
    PolicyName: "ReadAssets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::assets-bucket/*",
      },
    }),
  }),
);

const accessKeyCreation = await simIam.createAccessKey(
  new CreateAccessKeyCommand({
    UserName: "ApplicationUser",
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::assets-bucket/images/logo.svg",
  caller: {
    kind: "credentials",
    credentials: {
      accessKeyId: accessKeyCreation.AccessKey.AccessKeyId,
      secretAccessKey: accessKeyCreation.AccessKey.SecretAccessKey,
    },
  },
});

console.log(decision.isAllowed);
console.log(decision.caller.arn);
