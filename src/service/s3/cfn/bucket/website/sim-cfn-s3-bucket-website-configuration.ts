import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3WebsiteConfiguration } from "../../../command/put-bucket-website/put-bucket-website.command.js";

/**
 * Reads the `WebsiteConfiguration` property of an AWS::S3::Bucket Resource into
 * a PutBucketWebsite request.
 *
 * CloudFormation states `IndexDocument` and `ErrorDocument` as plain strings,
 * where the request nests each under the one field it carries.
 */
export class SimCfnS3BucketWebsiteConfiguration {
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
  }

  /**
   * The configuration to apply, or nothing when the Resource declares none.
   */
  read(): SimS3WebsiteConfiguration | undefined {
    const websiteConfig = this.properties["WebsiteConfiguration"];

    if (
      websiteConfig === undefined ||
      websiteConfig === null ||
      typeof websiteConfig !== "object" ||
      Array.isArray(websiteConfig)
    ) {
      return undefined;
    }

    if (
      "RoutingRules" in websiteConfig &&
      !Array.isArray(websiteConfig["RoutingRules"])
    ) {
      return undefined;
    }

    return {
      ...websiteConfig,
      IndexDocument: this.indexDocument(websiteConfig),
      ErrorDocument: this.errorDocument(websiteConfig),
    } as SimS3WebsiteConfiguration;
  }

  /**
   * A template naming the index document as a string gets it nested under the
   * `Suffix` the request carries. One already nested is left alone.
   */
  private indexDocument(
    websiteConfig: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValue | undefined {
    const indexDocument = websiteConfig["IndexDocument"];

    if (typeof indexDocument === "string") {
      return { Suffix: indexDocument };
    }

    return indexDocument;
  }

  private errorDocument(
    websiteConfig: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValue | undefined {
    const errorDocument = websiteConfig["ErrorDocument"];

    if (typeof errorDocument === "string") {
      return { Key: errorDocument };
    }

    return errorDocument;
  }
}
