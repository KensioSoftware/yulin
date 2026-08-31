import {
  assertIdentical,
  assertResponseStatus,
  assertThrowsError,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimS3InvalidBucketName } from "../error/sim-s3.error.js";
import { SimS3RestErrorResponse } from "./sim-s3-rest-error-response.js";

const errors = new SimS3RestErrorResponse({
  bucketName: "reports",
  objectKey: "q3 & q4.pdf",
});

describe("The error document a refused S3 REST request gets", () => {
  it("escapes what it puts in the XML", async () => {
    // Given an S3 error about a key containing XML syntax
    const response = errors.build(
      new SimS3InvalidBucketName("Bucket name <bad> is not valid"),
    );

    // Then the document is still well formed, so a client can parse it
    assertResponseStatus(response, 400, await describeResponse(response));
    const body = await response.text();
    expect(body).toMatch(/<Key>q3 &amp; q4.pdf<\/Key>/);
    expect(body).toMatch(/<Message>Bucket name &lt;bad&gt; is not valid/);
  });

  it("re-raises anything that is not an S3 or IAM failure", () => {
    // Given a bug in the simulator rather than a simulated AWS failure
    const bug = new TypeError("undefined is not a function");

    // When it reaches the boundary
    // Then it is raised rather than dressed up as an S3 error, which would
    // leave a test asserting on a failure AWS never produces
    const raised = assertThrowsError(() => errors.build(bug));
    assertIdentical(raised, bug);
  });
});
