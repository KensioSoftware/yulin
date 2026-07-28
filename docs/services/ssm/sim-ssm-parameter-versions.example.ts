/**
 * Overwriting a simulated parameter and reading an earlier version.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const overwritten = await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Value: "db2.internal",
    Overwrite: true,
  }),
);

console.log(overwritten.Version); // 2

const first = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-host:1" }),
);

console.log(first.Parameter?.Value); // "db.internal"
console.log(first.Parameter?.Selector); // ":1"
