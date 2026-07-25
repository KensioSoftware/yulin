import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, it } from "vitest";
import {
  assertIdentical,
  assertStringIncludes,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { SimAwsHttp } from "./sim-aws-http.js";
import { SimAws } from "../../service/aws/sim-aws.js";

describe("Simulated AWS HTTP", () => {
  it("responds HTTP 501 for unknown host", async () => {
    const simAwsHttp = new SimAwsHttp();

    const response = await simAwsHttp.fetch(
      new URL("http://foobar.sim-aws.localhost/"),
    );

    assertResponseStatus(response, 501, await describeResponse(response));
    const responseBody = await response.text();
    assertStringIncludes(
      responseBody,
      "Unknown simulated AWS host foobar.sim-aws.localhost",
    );
  });

  it("responds HTTP 400 when the request URL has no hostname", async () => {
    const simAwsHttp = new SimAwsHttp();

    const response = await simAwsHttp.handleRequest(
      new Request("data:text/plain,hello"),
    );

    assertResponseStatus(response, 400, await describeResponse(response));
    assertIdentical(await response.text(), "Missing Host header\n");
  });

  it("routes S3 website request to simulated S3 controller", async () => {
    const simAws = new SimAws();

    const simAwsHttp = new SimAwsHttp({ simAws });

    const response = await simAwsHttp.fetch(
      new Request(
        "http://my-site.s3-website.eu-west-2.sim-aws.localhost/foobar-object.html",
      ),
    );

    assertResponseStatus(response, 404);
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "S3 bucket named my-site not found");
  });

  it("routes custom domains to CloudFront through simulated Route53", async () => {
    const simAws = new SimAws();
    const hostedZoneCreation = await simAws.route53().createHostedZone({
      input: {
        Name: "foo.com",
        CallerReference: "foo-com-test",
      },
    });

    await simAws.route53().changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneCreation.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "www.foo.com",
                Type: "CNAME",
                ResourceRecords: [{ Value: "d123.cloudfront.net" }],
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    const simAwsHttp = new SimAwsHttp({ simAws });

    const response = await simAwsHttp.fetch(
      new Request("http://www.foo.com.sim-aws.localhost/"),
    );

    assertResponseStatus(response, 404);
    const responseBody = await response.text();
    assertStringIncludes(
      responseBody,
      "Suitable sim CloudFront Distribution not found",
    );
  });

  it("serves an S3 Object over simulated HTTP when static website hosting is configured", async () => {
    const simAws = new SimAws();

    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "foo-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "foo-site",
        Key: "index.html",
        Body: "<h1>Hello, world!</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );

    const response = await simAwsHttp.fetch(
      "http://foo-site.s3-website.eu-west-2.sim-aws.localhost/index.html",
    );

    assertResponseStatus(response, 200);
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await response.text(), "<h1>Hello, world!</h1>");
  });

  it("serves HEAD requests without a response body when static website hosting is configured", async () => {
    const simAws = new SimAws();

    const simAwsHttp = new SimAwsHttp({ simAws });
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "head-site" }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "head-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "head-site",
        Key: "index.html",
        Body: "<h1>Hello, world!</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );

    const response = await simAwsHttp.fetch(
      "http://head-site.s3-website.eu-west-2.sim-aws.localhost/index.html",
      { method: "HEAD" },
    );

    assertResponseStatus(response, 200);
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await response.text(), "");
  });
});
