import path from "node:path";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory as TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimCfnTemplateFileLoader } from "./sim-cfn-template-file-loader.js";

describe("SimCfnTemplateFileLoader", () => {
  it("loads a template file from a string path and derives the stack name", async () => {
    // Given a synthesized stack template and its sibling CDK assets manifest.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "TestStack.template.json";
    const assetsPath = "TestStack.assets.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
          },
        },
      }),
    );
    await temporaryDirectory.writeFile(
      assetsPath,
      jsonStringify({
        files: {},
      }),
    );

    // When the template file is loaded from a string path.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load(
      temporaryDirectory.join(templatePath),
    );

    // Then the template is parsed and the Stack name is derived from the file name.
    assertIdentical(loadedTemplate.stackName, "TestStack");
    assertObjectMatches(loadedTemplate.template, {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
        },
      },
    });
    assertUndefined(loadedTemplate.parameters);
  });

  it("loads explicit deployment props with stack name and parameters", async () => {
    // Given a template file, sibling CDK assets manifest and explicit deploy props.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "DerivedStack.template.json";
    const assetsPath = "DerivedStack.assets.json";
    const parameters = {
      BucketName: "explicit-bucket",
    };

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Parameters: {
          BucketName: {
            Type: "String",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                Ref: "BucketName",
              },
            },
          },
        },
      }),
    );
    await temporaryDirectory.writeFile(
      assetsPath,
      jsonStringify({
        files: {},
      }),
    );

    // When the template file is loaded with explicit props.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load({
      templatePath: temporaryDirectory.join(templatePath),
      stackName: "ExplicitStack",
      parameters,
    });

    // Then the explicit Stack name and parameters are preserved.
    assertIdentical(loadedTemplate.stackName, "ExplicitStack");
    assertIdentical(loadedTemplate.parameters, parameters);
    assertIdentical(
      loadedTemplate.template.Parameters?.["BucketName"]?.Type,
      "String",
    );
  });

  it("loads sibling CDK assets manifest context for a synthesized template", async () => {
    // Given a synthesized stack template and its sibling assets manifest.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "AssetStack.template.json";
    const assetsPath = "AssetStack.assets.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Resources: {},
      }),
    );
    await temporaryDirectory.writeFile(
      assetsPath,
      jsonStringify({
        files: {
          assetHash: {
            source: {
              path: "asset.assetHash",
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "assetHash.zip",
              },
            },
          },
        },
      }),
    );

    // When the template file is loaded.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load(
      temporaryDirectory.join(templatePath),
    );

    // Then the sibling CDK assets manifest is included in the context.
    assertObjectMatches(loadedTemplate.cdkOutContext, {
      templatePath: path.resolve(temporaryDirectory.join(templatePath)),
      templateDirectoryPath: temporaryDirectory.path(),
      assetsManifestPath: temporaryDirectory.join(assetsPath),
      assetsManifest: {
        files: {
          assetHash: {
            source: {
              path: "asset.assetHash",
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "assetHash.zip",
              },
            },
          },
        },
      },
    });
  });

  it("loads the template a transform returned, with the assets manifest beside the file", async () => {
    // Given a synthesized template naming a Hosted Zone the simulation cannot
    // look up, and its sibling CDK assets manifest.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "SiteStack.template.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Resources: {
          SiteRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: { HostedZoneId: "Z0123456789ABCDEFGHIJ" },
          },
        },
      }),
    );
    await temporaryDirectory.writeFile(
      "SiteStack.assets.json",
      jsonStringify({ files: {} }),
    );

    // When it is loaded through a transform that drops the record.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load({
      templatePath: temporaryDirectory.join(templatePath),
      transform: (template) => ({ ...template, Resources: {} }),
    });

    // Then the template to deploy is the one the transform returned.
    assertArrayEquals(Object.keys(loadedTemplate.template.Resources), []);

    // And the cloud assembly is still the one the file came from, since it is
    // found beside the path rather than read out of the template.
    assertObjectMatches(loadedTemplate.cdkOutContext, {
      templateDirectoryPath: temporaryDirectory.path(),
      assetsManifest: { files: {} },
    });
  });

  it("says a transform threw rather than letting it read as a bad template", async () => {
    // Given a template file and a transform that fails on it.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "SiteStack.template.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({ Resources: {} }),
    );

    // When the template file is loaded through it.
    const fileLoader = new SimCfnTemplateFileLoader();
    const error = await assertThrowsErrorAsync(async () => {
      await fileLoader.load({
        templatePath: temporaryDirectory.join(templatePath),
        transform: () => {
          throw new Error("no Hosted Zone ID for the review environment");
        },
      });
    });

    // Then loading fails, saying what threw and keeping the reason it gave.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation template transform",
    );
    assertStringIncludes(
      error.message,
      "no Hosted Zone ID for the review environment",
    );
    assertIdentical(
      (error.cause as Error).message,
      "no Hosted Zone ID for the review environment",
    );
  });

  it("loads a non-CDK template filename without requiring an assets manifest", async () => {
    // Given a template file whose name does not follow the CDK template naming convention.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "template.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Resources: {},
      }),
    );

    // When the template file is loaded.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load(
      temporaryDirectory.join(templatePath),
    );

    // Then no asset manifest is required, and the Stack name falls back to the file basename.
    assertIdentical(loadedTemplate.stackName, "template.json");
    assertObjectMatches(loadedTemplate.cdkOutContext, {
      templatePath: path.resolve(temporaryDirectory.join(templatePath)),
      templateDirectoryPath: temporaryDirectory.path(),
    });
    assertUndefined(loadedTemplate.cdkOutContext.assetsManifestPath);
    assertUndefined(loadedTemplate.cdkOutContext.assetsManifest);
  });

  it("loads a synthesized template with an empty assets manifest context when the sibling assets manifest is missing", async () => {
    // Given a synthesized stack template with no sibling CDK assets manifest.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "NoAssetsStack.template.json";
    const assetsPath = "NoAssetsStack.assets.json";

    await temporaryDirectory.writeFile(
      templatePath,
      jsonStringify({
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
          },
        },
      }),
    );

    // When the template file is loaded.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load(
      temporaryDirectory.join(templatePath),
    );

    // Then loading continues with an empty assets manifest context.
    assertObjectMatches(loadedTemplate.cdkOutContext, {
      templatePath: path.resolve(temporaryDirectory.join(templatePath)),
      templateDirectoryPath: temporaryDirectory.path(),
      assetsManifestPath: temporaryDirectory.join(assetsPath),
      assetsManifest: {},
    });
  });
});
