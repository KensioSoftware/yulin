/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import { assertNonNullable, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import {
  templatePause,
  untilApplied,
} from "../../../../test/cloudformation/watched-template.js";

describe("a watched template file written as YAML", () => {
  it("applies the change the file was saved with to the deployed Stack", async () => {
    // Given a Stack deployed from a watched YAML template file
    const directory = new TemporaryDirectory();
    await directory.writeFile("site.yaml", siteTemplate());

    // macOS delivers filesystem events with a short delay, so the write above
    // is settled before the watch starts rather than arriving as a change.
    await templatePause(250);

    const simAws = new SimAws();
    const updates: string[] = [];
    await simAws.cloudFormation().deployTemplateFile({
      templatePath: directory.join("site.yaml"),
      watch: {
        settleMs: 40,
        onUpdated: (): void => {
          updates.push("updated");
        },
      },
    });

    assertUndefined(simAws.s3().getSimBucketByName("site-uploads"));

    try {
      // When the file is saved with another Bucket in it
      await directory.writeFile(
        "site.yaml",
        siteTemplate({ withUploads: true }),
      );
      await untilApplied(updates);

      // Then the Bucket the change added is serving, named by the intrinsic
      // the short-form tag carried
      assertNonNullable(simAws.s3().getSimBucketByName("site-uploads"));
    } finally {
      simAws.cloudFormation().stopWatchingTemplateFiles();
    }
  });
});

interface SiteTemplateProperties {
  readonly withUploads?: boolean;
}

function siteTemplate(properties: SiteTemplateProperties = {}): string {
  return [
    "Resources:",
    "  Site:",
    "    Type: AWS::S3::Bucket",
    "    Properties:",
    '      BucketName: !Sub "${AWS::StackName}-content"',
    ...(properties.withUploads === true
      ? [
          "  Uploads:",
          "    Type: AWS::S3::Bucket",
          "    Properties:",
          '      BucketName: !Sub "${AWS::StackName}-uploads"',
        ]
      : []),
    "",
  ].join("\n");
}
