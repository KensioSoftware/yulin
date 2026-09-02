import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { faker } from "@faker-js/faker";
import {
  assertFalse,
  assertIdentical,
  assertObjectMatches,
  assertResponseStatus,
  assertStringIncludes,
  assertTrue,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  isSimAwsApiRequest,
  isSimAwsEndpointHostname,
  SimLambdaAwsApiOutbound,
} from "./sim-lambda-aws-api-outbound.js";

/**
 * The credential scope of a request signed for a service, as the Authorization
 * header carries it.
 */
function signedFor(signingName: string): string {
  return (
    `AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260818/eu-west-2/` +
    `${signingName}/aws4_request, SignedHeaders=host;x-amz-date, ` +
    "Signature=0000000000000000000000000000000000000000000000000000000000000000"
  );
}

/**
 * A simulated table holding one order.
 */
async function simAwsWithOrders(): Promise<SimAws> {
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: "order-1" }, total: { N: "42" } },
    }),
  );

  return simAws;
}

describe("The AWS service API a sim Lambda's requests reach", () => {
  it("recognises the hostnames AWS issues its endpoints under", () => {
    // Given the endpoint hostnames an SDK resolves for AWS services.
    // Then each is an AWS endpoint.
    assertTrue(isSimAwsEndpointHostname("dynamodb.eu-west-2.amazonaws.com"));
    assertTrue(isSimAwsEndpointHostname("DynamoDB.eu-west-2.amazonaws.com"));
    assertTrue(isSimAwsEndpointHostname("s3.cn-north-1.amazonaws.com.cn"));
    assertTrue(isSimAwsEndpointHostname("scheduler.eu-west-2.api.aws"));

    // And a hostname of the application's own is not.
    assertFalse(isSimAwsEndpointHostname("api.example.com"));
    assertFalse(isSimAwsEndpointHostname("notamazonaws.com"));
  });

  it("leaves the endpoints of one resource to be served as they are", () => {
    // Given the endpoints AWS issues for a single resource rather than for a
    // service API, which carry an HTTP request rather than a Command.
    // Then a Lambda Function URL is not a service API endpoint.
    assertFalse(
      isSimAwsEndpointHostname("abcdefg1234.lambda-url.eu-west-2.on.aws"),
    );

    // And neither is an API Gateway HTTP API endpoint.
    assertFalse(
      isSimAwsEndpointHostname("abc123.execute-api.eu-west-2.amazonaws.com"),
    );
  });

  it("tells an API call apart from a document published at the same endpoint", () => {
    // Given a serialized Command, which says which operation it is.
    const command = new Request(
      "https://cognito-idp.eu-west-2.amazonaws.com/",
      {
        method: "POST",
        headers: {
          "x-amz-target": "AWSCognitoIdentityProviderService.GetUser",
        },
      },
    );

    // And a signed request naming an operation nowhere, since only an SDK
    // holds credentials to sign with.
    const signed = new Request(
      "https://data.s3.eu-west-2.amazonaws.com/greeting.txt",
      { headers: { authorization: signedFor("s3") } },
    );

    // And a JWKS fetch, which a token verifier makes holding neither.
    const published = new Request(
      "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_aBcDeFgHi/.well-known/jwks.json",
    );

    // Then the two an SDK sent are API calls and the published document is
    // not.
    assertTrue(isSimAwsApiRequest(command));
    assertTrue(isSimAwsApiRequest(signed));
    assertFalse(isSimAwsApiRequest(published));
  });

  it("answers a Command an SDK addressed to a service endpoint", async () => {
    // Given a simulation holding an order, and the outbound HTTP a function
    // in it reaches AWS through.
    const simAws = await simAwsWithOrders();
    const outbound = new SimLambdaAwsApiOutbound({
      simAws,
      regionName: "eu-west-2",
    });

    // When a serialized GetItem arrives, as the SDK's transport sends it.
    const response = await outbound.fetch(
      new Request("https://dynamodb.eu-west-2.amazonaws.com/", {
        method: "POST",
        headers: {
          "content-type": "application/x-amz-json-1.0",
          "x-amz-target": "DynamoDB_20120810.GetItem",
        },
        body: JSON.stringify({
          TableName: "orders",
          Key: { orderId: { S: "order-1" } },
        }),
      }),
    );

    // Then the simulated operation answered it, in the response the SDK reads.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertObjectMatches(await response.json(), {
      Item: { total: { N: "42" } },
    });
  });

  it("answers a request an SDK signed for S3, which names no operation header", async () => {
    // Given a simulation holding an Object, and the outbound HTTP a function
    // in it reaches AWS through.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const bucketName = faker.string.alpha({ length: 10, casing: "lower" });
    const greeting = faker.lorem.sentence();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "greeting.txt",
        Body: greeting,
      }),
    );
    const outbound = new SimLambdaAwsApiOutbound({
      simAws,
      regionName: "eu-west-2",
    });

    // When a signed GetObject arrives, addressed the way an SDK resolving
    // S3's own endpoint sends it.
    const response = await outbound.fetch(
      new Request(
        `https://${bucketName}.s3.eu-west-2.amazonaws.com/greeting.txt?x-id=GetObject`,
        { headers: { authorization: signedFor("s3") } },
      ),
    );

    // Then simulated S3 answered with the Object, rather than the request
    // being refused for carrying no operation header.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), greeting);
  });

  it("runs an S3 request as the caller the function is running as", async () => {
    // Given a simulation holding an Object, and a Role that may write to the
    // Bucket but not read from it.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const bucketName = faker.string.alpha({ length: 10, casing: "lower" });
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "greeting.txt",
        Body: faker.lorem.sentence(),
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ObjectWriterRole",
        actions: ["s3:PutObject"],
        resource: `arn:aws:s3:::${bucketName}/*`,
      },
      simAws,
    );
    const outbound = new SimLambdaAwsApiOutbound({
      simAws,
      regionName: "eu-west-2",
    });

    // When a signed GetObject arrives while that Role is the ambient caller,
    // as it is throughout a sim Lambda invocation.
    const response = await simAws.runAs({ kind: "arn", arn: role.Arn }, () =>
      outbound.fetch(
        new Request(
          `https://${bucketName}.s3.eu-west-2.amazonaws.com/greeting.txt?x-id=GetObject`,
          { headers: { authorization: signedFor("s3") } },
        ),
      ),
    );

    // Then S3 refused it as the Role, in the response an SDK reads back as an
    // AccessDenied error.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertStringIncludes(await response.text(), "AccessDenied");
  });
});
