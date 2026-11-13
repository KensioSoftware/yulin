/**
 * Confining each User to its own prefix with one shared policy.
 */

import { CreateUserCommand, PutUserPolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "analyst",
    PolicyName: "OwnHomePrefix",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        // eslint-disable-next-line no-template-curly-in-string
        Resource: "arn:aws:s3:::homes-bucket/${aws:username}/*",
      },
    }),
  }),
);

const read = (key: string): boolean =>
  simIam.authorize({
    action: "s3:GetObject",
    resource: `arn:aws:s3:::homes-bucket/${key}`,
    caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
  }).isAllowed;

console.log(read("analyst/notes.txt")); // true
console.log(read("auditor/notes.txt")); // false
