/**
 * The same simulated parameter name in two Account and Region scopes.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .ssm()
  .putParameter(
    new PutParameterCommand({
      Name: "/myapp/db-host",
      Type: "String",
      Value: "eu.db.internal",
    }),
  );

await simAws
  .account("222222222222")
  .region("us-east-1")
  .ssm()
  .putParameter(
    new PutParameterCommand({
      Name: "/myapp/db-host",
      Type: "String",
      Value: "us.db.internal",
    }),
  );

const read = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/myapp/db-host" }));

console.log(read.Parameter?.ARN);
// "arn:aws:ssm:eu-west-2:111111111111:parameter/myapp/db-host"
