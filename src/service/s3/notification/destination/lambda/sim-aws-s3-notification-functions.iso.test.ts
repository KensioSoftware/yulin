import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../../lambda/function/code/lambda-zip-file-input.js";
import { SimAwsS3NotificationFunctions } from "./sim-aws-s3-notification-functions.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("Simulated Lambda functions as S3 notification destinations", () => {
  it("refuses to invoke a function that is not there", async () => {
    // Given a simulation with no functions in it
    const simAws = new SimAws();
    const functions = new SimAwsS3NotificationFunctions({ simAws });

    // When one is invoked anyway, which delivery only reaches if the function
    // went away between the check and the invocation
    const error = await assertThrowsErrorAsync(async () =>
      functions.invoke(
        {
          destinationArn: thumbnailerArn,
          bucketArn: "arn:aws:s3:::uploads",
          bucketOwnerAccountId: simAws.defaultAccountId,
        },
        { Records: [] },
      ),
    );

    // Then the missing function is reported rather than silently skipped
    assertStringIncludes(error.message, "not a simulated Lambda function");
  });

  it("refuses an ARN that is not a Lambda function", () => {
    // Given a simulation
    const simAws = new SimAws();
    const functions = new SimAwsS3NotificationFunctions({ simAws });

    // When the destination names a Lambda layer rather than a function
    let raised: unknown;
    try {
      functions.invokeRefusal({
        destinationArn: "arn:aws:lambda:us-east-1:888888888888:layer:shared",
        bucketArn: "arn:aws:s3:::uploads",
        bucketOwnerAccountId: simAws.defaultAccountId,
      });
    } catch (error) {
      raised = error;
    }

    // Then the ARN is refused for what it is
    assertIdentical((raised as Error).name, "InvalidArgument");
    assertStringIncludes(
      (raised as Error).message,
      "is not a Lambda function ARN",
    );
  });

  it("has no refusal for a function that admits the Bucket", async () => {
    // Given a function granting S3 the invoke action for a Bucket
    const simAws = new SimAws();
    await simAws.lambda().createFunction({
      input: {
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      },
    });
    await simAws.lambda().addPermission({
      input: {
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::uploads",
      },
    });

    // When S3 asks whether it may invoke it
    const refusal = new SimAwsS3NotificationFunctions({ simAws }).invokeRefusal(
      {
        destinationArn: thumbnailerArn,
        bucketArn: "arn:aws:s3:::uploads",
        bucketOwnerAccountId: simAws.defaultAccountId,
      },
    );

    // Then there is nothing to report
    assertUndefined(refusal);
  });
});
