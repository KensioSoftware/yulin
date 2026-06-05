import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimS3ServiceController } from "./sim-s3-controller.js";
import type { SimS3BucketName } from "../bucket/s3-bucket.js";

describe("Simulated S3 local HTTP controller", () => {
  it("responds HTTP 400 for missing S3 Bucket name", async () => {
    const res = await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "",
        regionName: "eu-west-2",
      },
      new Request("http://s3-website.eu-west-2.localhost/index.html", {
        method: "GET",
      }),
    );

    assertIdentical(res.status, 400);
    assertStringIncludes(await res.text(), "Missing S3 Bucket name");
  });

  it("responds HTTP 400 for missing S3 Bucket region", async () => {
    const res = await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "foo-site",
      },
      new Request("http://foo-site.s3-website.localhost/index.html", {
        method: "GET",
      }),
    );

    assertIdentical(res.status, 400);
    assertStringIncludes(await res.text(), "Missing S3 Bucket region");
  });

  it("responds HTTP 404 when the Bucket is registered but missing from its scope", async () => {
    const simAws = new SimAws();

    simAws.s3GlobalRegistry().registerBucket("ghost-site" as SimS3BucketName, {
      accountId: simAws.defaultAccountId,
      regionName: "eu-west-2",
    });

    const res = await new SimS3ServiceController(simAws).handleRequest(
      {
        service: "s3",
        resourceName: "ghost-site",
        regionName: "eu-west-2",
      },
      new Request(
        "http://ghost-site.s3-website.eu-west-2.localhost/index.html",
        {
          method: "GET",
        },
      ),
    );

    assertIdentical(res.status, 404);
    assertStringIncludes(
      await res.text(),
      "S3 bucket named ghost-site not found",
    );
  });
});
