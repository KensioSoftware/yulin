import { buffer } from "node:stream/consumers";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("updating a Stack from its template file", () => {
  it("applies the changed file and leaves the Resources it did not change", async () => {
    // Given a Stack deployed from a template file, holding an Object
    const { simAws, directory, templatePath } = await deployedFrom({
      Resources: { Site: bucketResource("site-content") },
    });

    await simAws.s3().putObject({
      input: {
        Bucket: "site-content",
        Key: "index.html",
        Body: "<h1>Hello</h1>",
      },
    });

    // When the template file is synthesized again with another Bucket in it
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({
        Resources: {
          Site: bucketResource("site-content"),
          Uploads: bucketResource("site-uploads"),
        },
      }),
    );

    await simAws.cloudFormation().updateTemplateFile(templatePath);

    // Then the Bucket the change added is there
    assertNonNullable(simAws.s3().getSimBucketByName("site-uploads"));

    // And the Bucket the change left alone still holds its Object
    assertIdentical(
      await objectBody(simAws, "site-content", "index.html"),
      "<h1>Hello</h1>",
    );
  });

  it("refuses a template file written without being changed", async () => {
    // Given a Stack deployed from a template file
    const { simAws, directory, templatePath } = await deployedFrom({
      Resources: { Site: bucketResource("site-content") },
    });

    // When the same template is written again, as a re-synth of unchanged
    // infrastructure writes it
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({ Resources: { Site: bucketResource("site-content") } }),
    );

    // Then it is refused the way CloudFormation refuses an update with nothing
    // in it
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().updateTemplateFile(templatePath);
    });
    assertIdentical(error.message, "No updates are to be performed.");
  });

  it("reads the assets manifest the template was synthesized with", async () => {
    // Given a Stack deployed from a cloud assembly with one staged asset
    const directory = new TemporaryDirectory();
    await directory.writeFile("asset.first.txt", "first");
    await directory.writeFile(
      "Site.assets.json",
      jsonStringify(assetsManifest("asset.first.txt", "first.txt")),
    );
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({ Resources: { Site: bucketResource("site-content") } }),
    );

    const simAws = new SimAws();
    const templatePath = directory.join("Site.template.json");
    await simAws.cloudFormation().deployTemplateFile(templatePath);
    assertIdentical(
      await objectBody(simAws, "cdk-staging", "first.txt"),
      "first",
    );

    // When it is synthesized again, staging a different asset beside the
    // changed template
    await directory.writeFile("asset.second.txt", "second");
    await directory.writeFile(
      "Site.assets.json",
      jsonStringify(assetsManifest("asset.second.txt", "second.txt")),
    );
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({
        Resources: {
          Site: bucketResource("site-content"),
          Uploads: bucketResource("site-uploads"),
        },
      }),
    );

    await simAws.cloudFormation().updateTemplateFile(templatePath);

    // Then the update published the asset that synthesis staged, rather than
    // looking for it in the manifest the Stack was deployed with
    assertIdentical(
      await objectBody(simAws, "cdk-staging", "second.txt"),
      "second",
    );
  });

  it("applies the parameter values the deployment was given", async () => {
    // Given a Stack deployed from a template file with a parameter
    const directory = new TemporaryDirectory();
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(parameterisedTemplate()),
    );

    const simAws = new SimAws();
    const deployment = {
      templatePath: directory.join("Site.template.json"),
      parameters: { SiteBucketName: "site-one" },
    };

    await simAws.cloudFormation().deployTemplateFile(deployment);
    assertNonNullable(simAws.s3().getSimBucketByName("site-one"));

    // When the file changes and the update is given the same parameters
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({
        ...parameterisedTemplate(),
        Resources: {
          ...parameterisedTemplate().Resources,
          Uploads: bucketResource("site-uploads"),
        },
      }),
    );

    await simAws.cloudFormation().updateTemplateFile(deployment);

    // Then the Resource resolved from the parameter is left where it is
    assertNonNullable(simAws.s3().getSimBucketByName("site-one"));
    assertUndefined(simAws.s3().getSimBucketByName("site-two"));
    assertNonNullable(simAws.s3().getSimBucketByName("site-uploads"));
  });
});

interface Deployed {
  readonly simAws: SimAws;
  readonly directory: TemporaryDirectory;
  readonly templatePath: string;
}

async function deployedFrom(template: object): Promise<Deployed> {
  const directory = new TemporaryDirectory();
  await directory.writeFile("Site.template.json", jsonStringify(template));

  const simAws = new SimAws();
  const templatePath = directory.join("Site.template.json");
  await simAws.cloudFormation().deployTemplateFile(templatePath);

  return { simAws, directory, templatePath };
}

async function objectBody(
  simAws: SimAws,
  bucketName: string,
  objectKey: string,
): Promise<string> {
  const output = await simAws
    .s3()
    .getObject({ input: { Bucket: bucketName, Key: objectKey } });
  assertNonNullable(output.Body);

  const bytes = await buffer(output.Body);

  return bytes.toString("utf8");
}

function bucketResource(bucketName: string): object {
  return {
    Type: "AWS::S3::Bucket",
    Properties: { BucketName: bucketName },
  };
}

interface ParameterisedTemplate {
  readonly Parameters: Record<string, object>;
  readonly Resources: Record<string, object>;
}

function parameterisedTemplate(): ParameterisedTemplate {
  return {
    Parameters: { SiteBucketName: { Type: "String" } },
    Resources: {
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: { Ref: "SiteBucketName" } },
      },
    },
  };
}

function assetsManifest(sourcePath: string, objectKey: string): object {
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
