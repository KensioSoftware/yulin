import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, it } from "vitest";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { SimAwsHttp } from "./sim-aws-http.js";
import { SimAws } from "../../service/aws/sim-aws.js";

describe("Simulated AWS HTTP", () => {
  it("responds HTTP 501 for unknown host", async () => {
    const simAwsHttp = new SimAwsHttp();

    const res = await simAwsHttp.fetch(
      new URL("http://foobar.sim-aws.localhost/"),
    );

    assertIdentical(res.status, 501);
    const resBody = await res.text();
    assertStringIncludes(
      resBody,
      "Unknown simulated AWS host foobar.sim-aws.localhost",
    );
  });

  it("responds HTTP 400 when the request URL has no hostname", async () => {
    const simAwsHttp = new SimAwsHttp();

    const res = await simAwsHttp.handleRequest(
      new Request("data:text/plain,hello"),
    );

    assertIdentical(res.status, 400);
    assertIdentical(await res.text(), "Missing Host header\n");
  });

  it("routes S3 website request to simulated S3 controller", async () => {
    const simAwsHttp = new SimAwsHttp();

    const res = await simAwsHttp.fetch(
      new Request(
        "http://my-site.s3-website.eu-west-2.sim-aws.localhost/foobar-object.html",
      ),
    );

    assertIdentical(res.status, 404);
    const resBody = await res.text();
    assertStringIncludes(resBody, "S3 bucket named my-site not found");
  });

  it("serves an S3 Object over simulated HTTP", async () => {
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp(simAws);

    await simAws
      .region("eu-west-2")
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));

    await simAws
      .region("eu-west-2")
      .s3()
      .putObject(
        new PutObjectCommand({
          Bucket: "foo-site",
          Key: "index.html",
          Body: "<h1>Hello, world!</h1>",
          ContentType: "text/html; charset=utf-8",
        }),
      );

    const res = await simAwsHttp.fetch(
      "http://foo-site.s3-website.eu-west-2.sim-aws.localhost/index.html",
    );

    assertIdentical(res.status, 200);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await res.text(), "<h1>Hello, world!</h1>");
  });

  it("serves HEAD requests without a response body", async () => {
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp(simAws);

    await simAws
      .region("eu-west-2")
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));

    await simAws
      .region("eu-west-2")
      .s3()
      .putObject(
        new PutObjectCommand({
          Bucket: "foo-site",
          Key: "index.html",
          Body: "<h1>Hello, world!</h1>",
          ContentType: "text/html; charset=utf-8",
        }),
      );

    const res = await simAwsHttp.fetch(
      "http://foo-site.s3-website.eu-west-2.sim-aws.localhost/index.html",
      { method: "HEAD" },
    );

    assertIdentical(res.status, 200);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await res.text(), "");
  });
});
