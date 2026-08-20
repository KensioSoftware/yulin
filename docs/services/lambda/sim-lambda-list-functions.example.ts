/**
 * Listing the simulated Lambda functions an Account and Region holds.
 */

import {
  CreateFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

for (const functionName of ["orders", "invoices"]) {
  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => functionName) },
    }),
  );
}

const listed = await lambda.listFunctions(new ListFunctionsCommand({}));
console.log(listed.Functions.map((simFunction) => simFunction.FunctionName));

await simAws.backgroundTasksComplete();
