/**
 * Reading an existing parameter from a template with a dynamic reference.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      DbUrl: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/prod/db-url",
          Type: "String",
          Value: "postgres://{{resolve:ssm:/myapp/prod/db-host}}:5432/app",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-url" }));

console.log(read.Parameter?.Value); // "postgres://db.internal:5432/app"
