import { createHash } from "node:crypto";

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import {
  simIamSigV4ContentSha256Header,
  simIamSigV4UnsignedPayload,
} from "../../iam/sigv4/canonical/sim-iam-sigv4-payload-hash.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { simLambdaUrlSignatureMismatchMessage } from "./response/sim-lambda-url-error-response.js";
import type { SimLambdaFunctionUrlEvent } from "./event/sim-lambda-url-event.type.js";

const accountId = "888888888888";
const callerArn = `arn:aws:iam::${accountId}:user/Poster`;

/**
 * Function code echoing the body it was posted, so a test can tell an
 * invocation from a refusal by what came back.
 */
const echoBodyCode = {
  ZipFile: makeLambdaZipFileInput(
    (event: SimLambdaFunctionUrlEvent) => event.body,
  ),
};

function sha256(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * An `AWS_IAM` Function URL a named caller is allowed to invoke.
 */
async function serveBodyEcho(simAws: SimAws): Promise<string> {
  const created = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "poster",
      Role: `arn:aws:iam::${accountId}:role/PosterRole`,
      Code: echoBodyCode,
    }),
  );
  const urlConfig = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "poster",
      AuthType: "AWS_IAM",
    }),
  );

  await simAws.iam().createUser(new CreateUserCommand({ UserName: "Poster" }));
  await simAws.iam().putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Poster",
      PolicyName: "InvokeUrl",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: "lambda:InvokeFunctionUrl",
          Resource: created.FunctionArn,
        },
      }),
    }),
  );

  return new SimAwsLocalUrl({ input: urlConfig.FunctionUrl }).toString();
}

describe("The payload hash an AWS_IAM Function URL request declares", () => {
  it("invokes for a POST declaring the hash of its body", async () => {
    // Given a Function URL and a caller allowed to invoke it
    const simAws = new SimAws();
    const url = await serveBodyEcho(simAws);
    const body = faker.lorem.sentence();

    // When it posts a body along with that body's digest
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      method: "POST",
      body,
      headers: {
        [simAwsCallerHeaderName]: callerArn,
        [simIamSigV4ContentSha256Header]: sha256(body),
      },
    });

    // Then the function ran on the body that arrived
    expect(response.status).toBe(200);
    expect(await response.json()).toBe(body);
  });

  it("invokes for a POST declaring no payload hash at all", async () => {
    // Given a Function URL and a caller allowed to invoke it
    const simAws = new SimAws();
    const url = await serveBodyEcho(simAws);
    const body = faker.lorem.sentence();

    // When it posts a body without declaring what it hashes to
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      method: "POST",
      body,
      headers: { [simAwsCallerHeaderName]: callerArn },
    });

    // Then nothing is refused: the hash is an input to a signature rather than
    // something a request has to state, so there is no claim to disagree with
    expect(response.status).toBe(200);
  });

  it("refuses a POST declaring the hash of some other body", async () => {
    // Given a Function URL and a caller allowed to invoke it
    const simAws = new SimAws();
    const url = await serveBodyEcho(simAws);

    // When it posts one body and declares the digest of another
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      method: "POST",
      body: faker.lorem.sentence(),
      headers: {
        [simAwsCallerHeaderName]: callerArn,
        [simIamSigV4ContentSha256Header]: sha256(faker.lorem.paragraph()),
      },
    });

    // Then it is refused as a signature mismatch, since a declaration nothing
    // checked would leave the body free to be replaced
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      Message: simLambdaUrlSignatureMismatchMessage,
    });
  });

  it("refuses a POST declaring an unsigned payload", async () => {
    // Given a Function URL and a caller allowed to invoke it
    const simAws = new SimAws();
    const url = await serveBodyEcho(simAws);

    // When it posts a body it declines to cover, which is how CloudFront signs
    // a POST the viewer sent no hash with
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      method: "POST",
      body: faker.lorem.sentence(),
      headers: {
        [simAwsCallerHeaderName]: callerArn,
        [simIamSigV4ContentSha256Header]: simIamSigV4UnsignedPayload,
      },
    });

    // Then Lambda refuses it: it takes no unsigned payload, whoever sent it
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      Message: simLambdaUrlSignatureMismatchMessage,
    });
  });

  it("refuses an unsigned payload on a request whose signature verifies", async () => {
    // Given a Function URL, and an access key for the user allowed to invoke it
    const simAws = new SimAws();
    const url = await serveBodyEcho(simAws);
    const key = await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Poster" }));

    // When a real SigV4 client signs a POST declaring an unsigned payload,
    // which the signature then covers correctly
    const signed = await signAwsRequest({
      url,
      credentials: {
        accessKeyId: key.AccessKey.AccessKeyId,
        secretAccessKey: key.AccessKey.SecretAccessKey,
      },
      method: "POST",
      body: faker.lorem.sentence(),
      headers: {
        [simIamSigV4ContentSha256Header]: simIamSigV4UnsignedPayload,
      },
    });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the signature is beside the point: the body it covers is nothing,
    // and Lambda has no use for a request like that
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      Message: simLambdaUrlSignatureMismatchMessage,
    });
  });
});
