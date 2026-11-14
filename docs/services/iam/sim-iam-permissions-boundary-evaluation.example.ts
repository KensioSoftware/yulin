/**
 * Capping what a User's own policies grant with a permissions boundary.
 */

import {
  CreatePolicyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createPolicy(
  new CreatePolicyCommand({
    PolicyName: "S3Only",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
  }),
);

await simIam.createUser(
  new CreateUserCommand({
    UserName: "analyst",
    PermissionsBoundary: "arn:aws:iam::123456789012:policy/S3Only",
  }),
);

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "analyst",
    PolicyName: "Everything",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
);

const caller = {
  kind: "arn" as const,
  arn: "arn:aws:iam::123456789012:user/analyst",
};

const read = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports/q1.csv",
  caller,
});

console.log(read.isAllowed); // true

const send = simIam.authorize({
  action: "sqs:SendMessage",
  resource: "arn:aws:sqs:eu-west-2:123456789012:jobs",
  caller,
});

console.log(send.isAllowed); // false
// because no permissions boundary allows the sqs:SendMessage action
console.log(send.denialReason);
