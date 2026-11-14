/**
 * Rolling a managed policy forward to a new version.
 */

import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateUserCommand,
  ListPolicyVersionsCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

const { Policy } = await simIam.createPolicy(
  new CreatePolicyCommand({
    PolicyName: "Reports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
    }),
  }),
);
await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));
await simIam.attachUserPolicy(
  new AttachUserPolicyCommand({ UserName: "analyst", PolicyArn: Policy.Arn }),
);

// Version 2 allows writes as well, and becomes the default
await simIam.createPolicyVersion(
  new CreatePolicyVersionCommand({
    PolicyArn: Policy.Arn,
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "*",
      },
    }),
    SetAsDefault: true,
  }),
);

const versions = await simIam.listPolicyVersions(
  new ListPolicyVersionsCommand({ PolicyArn: Policy.Arn }),
);
const decision = simIam.authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
});

console.log(versions.Versions.map((version) => version.VersionId)); // ["v2", "v1"]
console.log(decision.isAllowed); // true
