/**
 * Reading several simulated parameters, including one name with a typo.
 */

import { GetParametersCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

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

const read = await ssm.getParameters(
  new GetParametersCommand({
    Names: ["/myapp/prod/db-host", "/myapp/prod/db-hostt"],
  }),
);

console.log(read.Parameters?.map((parameter) => parameter.Name));
// [ "/myapp/prod/db-host" ]
console.log(read.InvalidParameters); // [ "/myapp/prod/db-hostt" ]
