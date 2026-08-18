/**
 * A simulated Lambda verifying a Cognito access token, with a verifier that
 * goes and fetches the pool's JWKS for itself.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The pool the API trusts, the app client its tokens are issued to, and the
// token a caller presented.
declare const userPoolId: string;
declare const clientId: string;
declare const accessToken: string;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "api",
    Role: "arn:aws:iam::111111111111:role/ApiRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: { token: string }) => {
        const verifier = CognitoJwtVerifier.create({
          userPoolId,
          tokenUse: "access",
          clientId,
        });

        return await verifier.verify(event.token);
      }),
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "api",
    Payload: JSON.stringify({ token: accessToken }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");

// The claims of the access token, read by the verifier the API ships with.
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
