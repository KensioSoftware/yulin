/**
 * Writing a simulated parameter and reading it back.
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

const read = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-host" }),
);

console.log(read.Parameter?.Value); // "db.internal"
console.log(read.Parameter?.Version); // 1
