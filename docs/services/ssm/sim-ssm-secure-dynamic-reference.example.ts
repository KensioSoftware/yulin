/**
 * Reading a SecureString parameter into a resource property from a template.
 */

import { PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/console-password",
    Type: "SecureString",
    Value: "hunter2",
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "console-stack",
  template: {
    Resources: {
      ConsoleUser: {
        Type: "AWS::IAM::User",
        Properties: {
          UserName: "ConsoleUser",
          LoginProfile: {
            Password: "{{resolve:ssm-secure:/myapp/prod/console-password}}",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const user = simAws
  .iam()
  .users.values()
  .find((each) => each.userName === "ConsoleUser");

console.log(user?.loginProfile?.password); // "hunter2"
