/**
 * An instance profile holding a Role.
 */

import {
  AddRoleToInstanceProfileCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetInstanceProfileCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "WebServer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);
await simIam.createInstanceProfile(
  new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
);
await simIam.addRoleToInstanceProfile(
  new AddRoleToInstanceProfileCommand({
    InstanceProfileName: "Web",
    RoleName: "WebServer",
  }),
);

const { InstanceProfile } = await simIam.getInstanceProfile(
  new GetInstanceProfileCommand({ InstanceProfileName: "Web" }),
);
console.log(InstanceProfile.Roles.map((role) => role.RoleName)); // ["WebServer"]

try {
  await simIam.deleteRole(new DeleteRoleCommand({ RoleName: "WebServer" }));
} catch (error) {
  console.log(error instanceof Error ? error.name : "unknown error");
  // "DeleteConflict"
}
