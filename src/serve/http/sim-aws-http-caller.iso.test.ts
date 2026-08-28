import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../test/sigv4/sign-aws-request.js";
import { createSigner } from "../../../test/sigv4/sim-signer.js";
import { SimAws } from "../../service/aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../service/iam/role/sim-iam-role-with-policy.factory.js";
import { makeLambdaZipFileInput } from "../../service/lambda/function/code/lambda-zip-file-input.js";
import { simAwsCallerHeaderName } from "../../service/iam/request/sim-aws-caller-header.js";
import {
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "../../service/iam/request/sim-aws-request-source.js";
import type { SimLambdaFunctionUrlEvent } from "../../service/lambda/serve/event/sim-lambda-url-event.type.js";
import { SimAwsHttp } from "./sim-aws-http.js";
import {
  simAwsAuthHeaderName,
  simAwsErrorDetailHeaderName,
  simAwsErrorHeaderName,
} from "./response/sim-aws-response-hints.js";
import { SimAwsLocalUrl } from "./url/sim-aws-local-url.js";

/**
 * A Function URL served on localhost whose handler echoes the headers it was
 * given, so a test can see the request exactly as the simulated service does.
 */
async function serveHeaderEcho(simAws: SimAws): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "echo",
      Role: "arn:aws:iam::888888888888:role/EchoRole",
      Code: {
        ZipFile: makeLambdaZipFileInput(
          (event: SimLambdaFunctionUrlEvent) => event.headers,
        ),
      },
    }),
  );

  const created = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "echo",
      AuthType: "NONE",
    }),
  );

  return new SimAwsLocalUrl({ input: created.FunctionUrl }).toString();
}

describe("The caller of a served simulated AWS request", () => {
  it("attributes an unauthenticated request to anonymous", async () => {
    // Given a Function URL served on localhost
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);

    // When it is requested without any identity
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then the simulator reports the caller as anonymous, not the Account
    // root, which is what an omitted in-process caller would have meant
    expect(response.headers.get(simAwsCallerHeaderName)).toBe("anonymous");
    expect(response.headers.get(simAwsAuthHeaderName)).toBe("none");
  });

  it("keeps an unauthenticated request anonymous under a default caller", async () => {
    // Given a simulation that names a default caller for its own calls, which
    // is what the Function below is then created as
    const simAws = new SimAws({
      defaultCaller: {
        kind: "arn",
        arn: "arn:aws:iam::888888888888:role/Administrator",
      },
    });
    await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Administrator",
        actions: ["*"],
        caller: simAws.account().rootPrincipal,
      },
      simAws,
    );
    const url = await serveHeaderEcho(simAws);

    // When a request arrives over HTTP carrying no identity
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then it is still anonymous. The default is a convenience for calls made
    // inside the process, and applying it here would hand that Role to anyone
    // who could reach the port
    expect(response.headers.get(simAwsCallerHeaderName)).toBe("anonymous");
    expect(response.headers.get(simAwsAuthHeaderName)).toBe("none");
  });

  it("attributes a request to the principal its caller header names", async () => {
    // Given a Function URL served on localhost
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);
    const arn = "arn:aws:iam::111111111111:role/Reporter";

    // When it is requested with a caller header, as a curl one-liner can
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: arn },
    });

    // Then the request is attributed to that Role
    expect(response.headers.get(simAwsCallerHeaderName)).toBe(arn);
    expect(response.headers.get(simAwsAuthHeaderName)).toBe("caller-header");
  });

  it("reports a service principal in the form the header accepts", async () => {
    // Given a Function URL served on localhost
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);

    // When it is requested as an AWS service principal
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: "service:s3.amazonaws.com" },
    });

    // Then what the simulator reports back can be sent straight back in
    expect(response.headers.get(simAwsCallerHeaderName)).toBe(
      "service:s3.amazonaws.com",
    );
  });

  it("hides the control headers from the simulated service", async () => {
    // Given a Function URL whose handler echoes the headers it receives
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);

    // When it is requested with a caller header, and with the resource the
    // call is being made on behalf of
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: {
        [simAwsCallerHeaderName]: "arn:aws:iam::111111111111:role/Reporter",
        [simAwsSourceArnHeaderName]:
          "arn:aws:cloudfront::111111111111:distribution/E1EXAMPLE12345",
        [simAwsSourceAccountHeaderName]: "111111111111",
        "x-application": "kept",
      },
    });

    // Then the handler never saw the simulator's control metadata, only the
    // request its client actually sent
    const seen = new Map(
      Object.entries((await response.json()) as Record<string, string>),
    );
    expect(seen.has(simAwsCallerHeaderName)).toBe(false);
    expect(seen.has(simAwsSourceArnHeaderName)).toBe(false);
    expect(seen.has(simAwsSourceAccountHeaderName)).toBe(false);
    expect(seen.get("x-application")).toBe("kept");
  });

  it("attributes a request to the principal that signed it", async () => {
    // Given a Function URL served on localhost, and a user holding an access
    // key in the same simulation
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);
    const credentials = await createSigner(simAws.iam());

    // When the localhost URL that is actually called is signed and requested
    const signed = await signAwsRequest({ url, credentials });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the signature over the local hostname verifies, and the signing
    // user is who the request is from
    expect(response.status).toBe(200);
    expect(response.headers.get(simAwsCallerHeaderName)).toBe(
      "arn:aws:iam::888888888888:user/Signer",
    );
    expect(response.headers.get(simAwsAuthHeaderName)).toBe("sigv4");
  });

  it("refuses a request whose signature does not match", async () => {
    // Given a signed request whose path is altered after signing
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);
    const credentials = await createSigner(simAws.iam());
    const signed = await signAwsRequest({ url, credentials });
    const tampered = new Request(`${url}elsewhere`, {
      headers: signed.request.headers,
    });

    // When it is served
    const response = await new SimAwsHttp({ simAws }).handleRequest(tampered);

    // Then it is refused with the body real AWS returns, and the simulator's
    // account of why goes in headers where it changes nothing for a client
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({ Message: "Forbidden" });
    expect(response.headers.get(simAwsErrorHeaderName)).toBe(
      "SignatureDoesNotMatch",
    );
    expect(response.headers.get(simAwsAuthHeaderName)).toBe("rejected");
  });

  it("says so when a signature names the wrong service", async () => {
    // Given a request signed for S3 and sent to a Lambda Function URL
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);
    const credentials = await createSigner(simAws.iam());
    const signed = await signAwsRequest({ url, credentials, service: "s3" });

    // When it is served
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the refusal explains the credential scope, rather than leaving a
    // bare signature mismatch to be worked out from first principles
    expect(response.status).toBe(403);
    expect(response.headers.get(simAwsErrorDetailHeaderName)).toContain(
      "signed for service s3",
    );
  });

  it("refuses a signature too incomplete to parse as a bad request", async () => {
    // Given a request whose Authorization header states the algorithm but not
    // the parts a signature is made of
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);

    // When it is served
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { authorization: "AWS4-HMAC-SHA256 SignedHeaders=host" },
    });

    // Then it is a 400, as real AWS answers IncompleteSignature: nothing was
    // presented that could have been authenticated in the first place
    expect(response.status).toBe(400);
    expect(response.headers.get(simAwsErrorHeaderName)).toBe(
      "IncompleteSignature",
    );
  });

  it("refuses a caller header it cannot read as a principal", async () => {
    // Given a Function URL served on localhost
    const simAws = new SimAws();
    const url = await serveHeaderEcho(simAws);

    // When it is requested with a caller header naming no principal form
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { [simAwsCallerHeaderName]: "Reporter" },
    });

    // Then it is a bad request: this is a mistake in driving the simulator
    // rather than a failed AWS authentication
    expect(response.status).toBe(400);
    expect(response.headers.get(simAwsErrorHeaderName)).toBe(
      "InvalidRequestCaller",
    );
    expect(response.headers.get(simAwsErrorDetailHeaderName)).toContain(
      "must be an ARN",
    );
  });
});
