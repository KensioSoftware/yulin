import { buffer } from "node:stream/consumers";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import {
  accountScopedName,
  accountScopedTemplate,
  withoutSynthesizedAccount,
} from "../../../../test/cloudformation/account-scoped-template.js";

describe("deploying a template file through a transform", () => {
  it("deploys what the transform returned rather than what the file holds", async () => {
    // Given a synthesized template naming Buckets the real account owns
    const directory = new TemporaryDirectory();
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(accountScopedTemplate()),
    );

    // When it is deployed through a transform that takes the account off it
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplateFile({
      templatePath: directory.join("Site.template.json"),
      transform: withoutSynthesizedAccount,
    });

    // Then the Bucket the transform asked for is the one simulated S3 holds
    assertNonNullable(simAws.s3().getSimBucketByName("site-content"));
    assertUndefined(
      simAws.s3().getSimBucketByName(accountScopedName("site-content")),
    );
  });

  it("resolves the staged assets beside the template it transformed", async () => {
    // Given a cloud assembly with a staged asset in it
    const directory = new TemporaryDirectory();
    await directory.writeFile("asset.page.txt", "hello");
    await directory.writeFile(
      "Site.assets.json",
      jsonStringify(stagedAsset("asset.page.txt", "page.txt")),
    );
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(accountScopedTemplate()),
    );

    // When its template is deployed through a transform
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplateFile({
      templatePath: directory.join("Site.template.json"),
      transform: withoutSynthesizedAccount,
    });

    // Then the asset synthesis staged is published, since the cloud assembly
    // is found beside the path rather than read out of the template
    const output = await simAws
      .s3()
      .getObject({ input: { Bucket: "cdk-staging", Key: "page.txt" } });
    assertNonNullable(output.Body);
    const bytes = await buffer(output.Body);
    assertIdentical(bytes.toString("utf8"), "hello");
  });

  it("fails the deployment when the transform throws", async () => {
    // Given a template file whose transform cannot adapt it
    const directory = new TemporaryDirectory();
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(accountScopedTemplate()),
    );

    // When it is deployed
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplateFile({
        templatePath: directory.join("Site.template.json"),
        transform: () => {
          throw new Error("no Hosted Zone ID for the review environment");
        },
      });
    });

    // Then nothing is deployed, and the reason is the one the transform gave
    assertStringIncludes(
      error.message,
      "no Hosted Zone ID for the review environment",
    );
    assertUndefined(
      simAws.s3().getSimBucketByName(accountScopedName("site-content")),
    );
  });

  it("applies the transform again when the file is applied as an update", async () => {
    // Given a Stack deployed from a template file through a transform
    const directory = new TemporaryDirectory();
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(accountScopedTemplate()),
    );

    const simAws = new SimAws();
    const deployment = {
      templatePath: directory.join("Site.template.json"),
      transform: withoutSynthesizedAccount,
    };
    await simAws.cloudFormation().deployTemplateFile(deployment);

    // When the stack is synthesized again with another Bucket in it
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(accountScopedTemplate({ withUploads: true })),
    );

    await simAws.cloudFormation().updateTemplateFile(deployment);

    // Then the update applied the transformed template too, rather than the
    // names the file on disk still holds
    assertNonNullable(simAws.s3().getSimBucketByName("site-uploads"));
    assertUndefined(
      simAws.s3().getSimBucketByName(accountScopedName("site-uploads")),
    );
  });
});

function stagedAsset(sourcePath: string, objectKey: string): object {
  return {
    files: {
      [objectKey]: {
        source: { path: sourcePath },
        destinations: {
          "current_account-current_region": {
            bucketName: "cdk-staging",
            objectKey,
          },
        },
      },
    },
  };
}
