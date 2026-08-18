/**
 * Deploying a parameter from a CloudFormation template and reading it back.
 */

import { GetParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "config-stack",
  template: {
    Resources: {
      DbHost: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/prod/db-host",
          Type: "String",
          Value: "db.internal",
          Description: "Where the application database lives",
        },
      },
    },
    Outputs: {
      DbHostParameter: {
        Value: { Ref: "DbHost" },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the parameter name, so it works as a GetParameter Name.
const parameterName = stack.output("DbHostParameter");

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: parameterName }));

console.log(read.Parameter?.Value); // "db.internal"
console.log(read.Parameter?.Version); // 1
