/**
 * Reading a simulated StringList parameter.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/allowed-origins",
    Type: "StringList",
    Value: "https://one.example,https://two.example",
  }),
);

const read = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/allowed-origins" }),
);

const origins = read.Parameter?.Value?.split(",") ?? [];

console.log(origins.length); // 2
