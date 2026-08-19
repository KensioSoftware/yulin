import { assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import { SimPayload1IamCaller } from "./sim-payload-1-iam-caller.js";

describe("The IAM caller of a payload format 1.0 invocation", () => {
  it("describes a principal by its ARN", () => {
    // Given a caller resolved to an IAM user
    const arn = "arn:aws:iam::111111111111:user/Invoker";
    const caller = new SimPayload1IamCaller(
      new SimAwsRequestCaller({
        principal: { kind: "arn", arn },
        authMethod: "sigv4",
      }),
    );

    // When it is described for the invocation event
    // Then the ARN identifies it in every field the simulator can honestly
    // fill, since the unique id real AWS puts in `caller` and `user` is not
    // something the request boundary knows
    assertObjectMatches(caller.identity(), {
      accountId: "111111111111",
      caller: arn,
      user: arn,
      userArn: arn,
    });
  });

  it("describes no caller for a principal without an ARN", () => {
    // Given a caller that is an AWS service rather than an IAM identity
    const caller = new SimPayload1IamCaller(
      new SimAwsRequestCaller({
        principal: { kind: "service", service: "s3.amazonaws.com" },
        authMethod: "caller-header",
      }),
    );

    // When it is described for the invocation event
    // Then there is nothing to name, and a handler reads the `null` it reads
    // for a request nobody authorized
    assertObjectMatches(caller.identity(), {
      accountId: null,
      caller: null,
      user: null,
      userArn: null,
    });
  });

  it("reports no Account for an ARN carrying none", () => {
    // Given a caller named by an ARN with no Account component, as S3 ARNs are
    const caller = new SimPayload1IamCaller(
      new SimAwsRequestCaller({
        principal: { kind: "arn", arn: "arn:aws:s3:::reports-bucket" },
        authMethod: "caller-header",
      }),
    );

    // When it is described for the invocation event
    // Then the Account is null rather than the empty string the ARN carries
    assertObjectMatches(caller.identity(), {
      accountId: null,
      userArn: "arn:aws:s3:::reports-bucket",
    });
  });

  it("names nobody at all for a request nothing authenticated", () => {
    // Given a method that authorized nobody, so there is no caller
    const caller = new SimPayload1IamCaller(undefined);

    // When the identity is described
    // Then every field naming a principal is null, which is what real API
    // Gateway sends for an open method
    assertObjectMatches(caller.identity(), {
      accountId: null,
      caller: null,
      user: null,
      userArn: null,
    });
  });
});
