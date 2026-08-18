/**
 * A simulated environment whose Lambda control plane is reached over the
 * served AWS API endpoint, signed the way a real client signs.
 *
 * This lives under `test/` rather than beside the endpoint because it imports
 * the real SigV4 signer, which is a devDependency, and because a module that
 * both exports helpers and declares tests is not allowed.
 */

import {
  CreateFunctionCommand,
  type CreateFunctionCommandInput,
} from "@aws-sdk/client-lambda";
import { PutUserPolicyCommand } from "@aws-sdk/client-iam";

import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import {
  signAwsRequest,
  type SignAwsRequestCredentials,
} from "../sigv4/sign-aws-request.js";
import { createSigner } from "../sigv4/sim-signer.js";

/**
 * The endpoint URL a client would have been given. Nothing listens on it, since
 * these requests are answered in the process that built the environment.
 */
export const servedLambdaApiEndpoint = "http://localhost:8787";

export interface ServedRequestParts {
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export interface ServedLambdaApi {
  readonly simAws: SimAws;

  /** Send one signed request to the served Lambda control plane. */
  readonly send: (
    method: string,
    path: string,
    parts?: ServedRequestParts,
  ) => Promise<Response>;
}

/**
 * A simulation holding one function, reached by a caller allowed to do
 * anything, so that what a test sees is the endpoint rather than a policy.
 */
export async function servedLambdaApi(
  functionInput: Partial<CreateFunctionCommandInput> = {},
): Promise<ServedLambdaApi> {
  const simAws = new SimAws();
  const credentials = await signingCredentials(simAws);
  const http = new SimAwsHttp({ simAws });

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::888888888888:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
      ...functionInput,
    }),
  );

  return {
    simAws,
    send: async (method, path, parts = {}): Promise<Response> => {
      const signed = await signAwsRequest({
        url: `${servedLambdaApiEndpoint}${path}`,
        credentials,
        method,
        service: "lambda",
        region: simAws.defaultRegionName,
        ...(parts.body !== undefined && { body: parts.body }),
        ...(parts.headers !== undefined && { headers: parts.headers }),
      });

      return await http.handleRequest(signed.request);
    },
  };
}

async function signingCredentials(
  simAws: SimAws,
): Promise<SignAwsRequestCredentials> {
  const simIam = simAws.iam();
  const credentials = await createSigner(simIam, "Invoker");

  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Invoker",
      PolicyName: "Everything",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: "*", Resource: "*" },
      }),
    }),
  );

  return credentials;
}
