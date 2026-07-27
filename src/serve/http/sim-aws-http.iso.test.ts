import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, it } from "vitest";
import { grantPublicWebsiteRead } from "../../service/s3/bucket/website/sim-s3-public-website.fixture.js";
import {
  assertIdentical,
  assertStringIncludes,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { SimAwsHttp } from "./sim-aws-http.js";
import { SimAws } from "../../service/aws/sim-aws.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";

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
    await grantPublicWebsiteRead(simS3, "foo-site");
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
    await grantPublicWebsiteRead(simS3, "head-site");
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

  describe("Date response header", () => {
    const instant = new Date("2026-07-26T09:30:00.000Z");

    it("stamps a served response with simulated time", async () => {
      // Given a simulation whose clock is stopped at a known instant
      const simAws = new SimAws({ clock: new SimFixedClock(instant) });
      const simAwsHttp = new SimAwsHttp({ simAws });

      // When any request is served
      const response = await simAwsHttp.fetch(
        "http://nothing-here.s3-website.eu-west-2.sim-aws.localhost/",
      );

      // Then the response reports simulated time, which is how an outside
      // client discovers it without knowing about the simulator
      assertIdentical(response.headers.get("date"), instant.toUTCString());
    });

    it("stamps a response that did not reach a service", async () => {
      // Given a simulation whose clock is stopped at a known instant
      const simAws = new SimAws({ clock: new SimFixedClock(instant) });
      const simAwsHttp = new SimAwsHttp({ simAws });

      // When a request names a host no simulated service answers for
      const response = await simAwsHttp.fetch("http://unknown.example.com/");

      // Then it is still stamped, as every real AWS response is
      assertResponseStatus(response, 501);
      assertIdentical(response.headers.get("date"), instant.toUTCString());
    });

    it("reports manipulated time to an outside client", async () => {
      // Given a simulation whose clock has been advanced by a day
      const simAws = new SimAws({ clock: new SimFixedClock(instant) });
      const simAwsHttp = new SimAwsHttp({ simAws });
      await simAws.clock().advanceBy({ days: 1 });

      // When any request is served
      const response = await simAwsHttp.fetch("http://unknown.example.com/");

      // Then the response reports the advanced time, so a client talking to
      // the simulation over HTTP sees the same "now" it does
      assertIdentical(
        response.headers.get("date"),
        new Date("2026-07-27T09:30:00.000Z").toUTCString(),
      );
    });
  });
});
