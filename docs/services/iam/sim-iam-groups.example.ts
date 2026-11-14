/**
 * Granting a User what its group allows.
 */

import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  CreateGroupCommand,
  CreateUserCommand,
  RemoveUserFromGroupCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

await simIam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
await simIam.attachGroupPolicy(
  new AttachGroupPolicyCommand({
    GroupName: "Readers",
    PolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
  }),
);
await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));

const mayRead = (): boolean =>
  simIam.authorize({
    action: "s3:GetObject",
    resource: "arn:aws:s3:::reports-bucket/summary.csv",
    caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
  }).isAllowed;

const membership = { GroupName: "Readers", UserName: "analyst" };
await simIam.addUserToGroup(new AddUserToGroupCommand(membership));
console.log(mayRead()); // true

await simIam.removeUserFromGroup(new RemoveUserFromGroupCommand(membership));
console.log(mayRead()); // false
