import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = "111111111111";
const regionName = "eu-west-2" as AwsRegionName;
const roleArn = `arn:aws:iam::${accountId}:role/ReportPublisher`;

describe("Presigning simulated S3 with temporary credentials", () => {
  it("serves a URL signed by an assumed Role session", async () => {
    // Given a Role that may read an Object, and a session that assumed it
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: regionName,
    });
    const simS3 = simAws.s3();
    const simIam = simAws.iam();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "published" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "published",
        Key: "q3.txt",
        Body: "signed by a session",
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportPublisher",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ReportPublisher",
        PolicyName: "ReadPublished",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::published/*",
          },
        }),
      }),
    );

    const session = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "publish",
      }),
    );
    const credentials = session.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When the session presigns a URL, carrying its session token in the query
    const url = await getSignedUrl(
      new S3Client({
        region: regionName,
        endpoint: simS3.getServiceUrl().toString(),
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
      }),
      new GetObjectCommand({ Bucket: "published", Key: "q3.txt" }),
      { expiresIn: 900 },
    );

    // Then the URL works, and the Role's policy is what allowed it
    expect(new URL(url).searchParams.get("X-Amz-Security-Token")).toBe(
      credentials.SessionToken,
    );
    const response = await new SimAwsHttp({ simAws }).fetch(url);
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "signed by a session");
  });
});
