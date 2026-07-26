import { describe, expect, it } from "vitest";

import { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import { SimLambdaUrlIamCaller } from "./sim-lambda-url-iam-authorizer.js";

function caller(arn: string): SimLambdaUrlIamCaller {
  return new SimLambdaUrlIamCaller(
    new SimAwsRequestCaller({
      principal: { kind: "arn", arn },
      authMethod: "sigv4",
    }),
  );
}

describe("The IAM caller of a Function URL invocation", () => {
  it("describes a principal by its ARN", () => {
    // Given a caller resolved to an IAM user
    const arn = "arn:aws:iam::111111111111:user/Invoker";

    // When it is described for the invocation event
    const context = caller(arn).authorizerContext();

    // Then the ARN is what identifies it, in every field the simulator can
    // honestly fill from what the request boundary knows
    expect(context?.iam).toStrictEqual({
      accessKey: "",
      accountId: "111111111111",
      callerId: arn,
      cognitoIdentity: null,
      principalOrgId: null,
      userArn: arn,
      userId: arn,
    });
  });

  it("describes no caller for a principal without an ARN", () => {
    // Given a caller that is an AWS service rather than an IAM identity
    const serviceCaller = new SimLambdaUrlIamCaller(
      new SimAwsRequestCaller({
        principal: { kind: "service", service: "s3.amazonaws.com" },
        authMethod: "caller-header",
      }),
    );

    // When it is described for the invocation event
    // Then there is nothing to describe, because real Lambda only ever
    // authenticates an IAM principal at a Function URL
    expect(serviceCaller.authorizerContext()).toBeUndefined();
    expect(serviceCaller.accountId()).toBe("anonymous");
  });

  it("reports an ARN carrying no Account as anonymous", () => {
    // Given a caller named by an ARN with no Account component, as S3 ARNs are
    const accountlessCaller = caller("arn:aws:s3:::reports-bucket");

    // When its Account is read
    // Then it is anonymous rather than an empty string, which is what a
    // Function URL reports when it has no Account behind a request
    expect(accountlessCaller.accountId()).toBe("anonymous");
  });
});
