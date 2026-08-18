/**
 * A simulated Lambda exchanging an authorization code for tokens at the
 * simulated Cognito user pool domain that issued it.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The pool's domain, the app client the callback authenticates as, and the
// code the browser carried to it.
declare const domainHost: string;
declare const clientId: string;
declare const clientSecret: string;
declare const callbackUrl: string;
declare const authorizationCode: string;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "user",
    Role: "arn:aws:iam::111111111111:role/UserRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: { code: string }) => {
        const credentials = `${clientId}:${clientSecret}`;
        const response = await fetch(`https://${domainHost}/oauth2/token`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: event.code,
            redirect_uri: callbackUrl,
          }).toString(),
        });

        return await response.json();
      }),
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "user",
    Payload: JSON.stringify({ code: authorizationCode }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");

// The id, access and refresh tokens the pool issued.
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
