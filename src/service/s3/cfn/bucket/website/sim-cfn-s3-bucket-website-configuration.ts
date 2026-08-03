import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type { SimS3WebsiteConfiguration } from "../../../command/put-bucket-website/put-bucket-website.command.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

/**
 * Reads the `WebsiteConfiguration` property of an AWS::S3::Bucket Resource into
 * a PutBucketWebsite request.
 *
 * CloudFormation states `IndexDocument` and `ErrorDocument` as plain strings,
 * where the request nests each under the one field it carries.
 */
export class SimCfnS3BucketWebsiteConfiguration {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly shape: SimCfnValueShape;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketResourceError(logicalId, reason),
    );
  }

  /**
   * The configuration to apply, or nothing when the Resource declares none.
   *
   * A configuration that is there but is not the shape it should be fails the
   * Resource. Read as nothing, it would deploy a Bucket that serves no website
   * and a Stack that succeeded.
   */
  read(): SimS3WebsiteConfiguration | undefined {
    const declared = this.properties["WebsiteConfiguration"];

    if (declared === undefined) {
      return undefined;
    }

    const websiteConfig = this.shape.record(declared, "WebsiteConfiguration");
    const routingRules = websiteConfig["RoutingRules"];

    if (routingRules !== undefined) {
      this.shape.list(routingRules, "WebsiteConfiguration RoutingRules");
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
