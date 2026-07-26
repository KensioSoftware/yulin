import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimAwsInvalidCallerHeader } from "./error/sim-aws-request-auth.error.js";
import { simAwsCallerHeaderName } from "./sim-aws-caller-header.js";

const endpoint = "http://abc123.lambda-url.us-east-1.sim-aws.localhost/";

function requestNaming(caller: string): Request {
  return new Request(endpoint, {
    headers: { [simAwsCallerHeaderName]: caller },
  });
}

describe("Resolving the caller of a request into simulated AWS", () => {
  it("resolves a request carrying no identity to anonymous", () => {
    // Given a simulation and a request stating nothing about who sent it
    const simAws = new SimAws();

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(new Request(endpoint));

    // Then it is anonymous, and emphatically not the Account root: in process
    // an omitted caller is the root principal with unrestricted access, and
    // over HTTP that would make every unauthenticated request an administrator
    expect(caller.principal).toStrictEqual({ kind: "anonymous" });
    expect(caller.authMethod).toBe("none");
  });

  it("resolves an IAM ARN named by the caller header", () => {
    // Given a request naming a Role directly
    const simAws = new SimAws();
    const arn = "arn:aws:iam::111111111111:role/Reporter";

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(requestNaming(arn));

    // Then that Role is who the request is from
    expect(caller.principal).toStrictEqual({ kind: "arn", arn });
    expect(caller.authMethod).toBe("caller-header");
  });

  it("resolves a service principal named by the caller header", () => {
    // Given a request naming an AWS service as its caller
    const simAws = new SimAws();

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(
      requestNaming("service:lambda.amazonaws.com"),
    );

    // Then the service principal is what comes back
    expect(caller.principal).toStrictEqual({
      kind: "service",
      service: "lambda.amazonaws.com",
    });
  });

  it("resolves anonymous named by the caller header", () => {
    // Given a request stating outright that it is anonymous
    const simAws = new SimAws();

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(requestNaming("anonymous"));

    // Then it is anonymous, and says so as a stated identity rather than an
    // absent one
    expect(caller.principal).toStrictEqual({ kind: "anonymous" });
    expect(caller.authMethod).toBe("caller-header");
  });

  it("does not check that a named ARN exists", () => {
    // Given a request naming a Role no simulation ever created
    const simAws = new SimAws();
    const arn = "arn:aws:iam::111111111111:role/NeverCreated";

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(requestNaming(arn));

    // Then it is accepted, as runAs accepts one: naming a principal is not
    // claiming it exists, and IAM will simply find no policies for it
    expect(caller.principal).toStrictEqual({ kind: "arn", arn });
  });

  it("refuses a caller header value naming nothing it understands", () => {
    // Given a request whose caller header is not one of the three forms
    const simAws = new SimAws();

    // When its caller is resolved
    // Then the grammar is spelled out rather than the value ignored
    expect(() =>
      simAws.resolveRequestCaller(requestNaming("Reporter")),
    ).toThrow(SimAwsInvalidCallerHeader);
  });

  it("refuses a caller header naming an empty service", () => {
    // Given a request whose caller header claims a service but names none
    const simAws = new SimAws();

    // When its caller is resolved
    // Then it is refused rather than read as a service called ""
    expect(() =>
      simAws.resolveRequestCaller(requestNaming("service:")),
    ).toThrow(SimAwsInvalidCallerHeader);
  });

  it("leaves an Authorization header of another scheme to the application", () => {
    // Given a request carrying a bearer token, as a Function URL with NONE
    // auth is entitled to receive
    const simAws = new SimAws();
    const request = new Request(endpoint, {
      headers: { authorization: "Bearer some-application-token" },
    });

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(request);

    // Then it is anonymous rather than a broken signature: that header is the
    // handler's business, not the simulator's
    expect(caller.principal).toStrictEqual({ kind: "anonymous" });
    expect(caller.authMethod).toBe("none");
  });
});
