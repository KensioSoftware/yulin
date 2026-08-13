import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a key value store Resource asks for, once read out of the template.
 */
export interface SimCfnCfKeyValueStoreConfig {
  readonly name: string;
  readonly comment: string | undefined;
}

/**
 * Reads an AWS::CloudFront::KeyValueStore Resource.
 *
 * `Name` is the only required property. `Comment` is kept when it is a string.
 *
 * `ImportSource` seeds a store from an S3 Object at deploy time, and nothing
 * here reads one. It is refused rather than ignored: a store that came up empty
 * when the template said to fill it would let a test pass against no data and
 * the same stack serve real data in AWS, which is the divergence worth failing
 * on. Write the keys with the key value store data API instead.
 */
export class SimCfnCfKeyValueStoreConfigReader {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * Read the config this Resource describes.
   */
  read(): SimCfnCfKeyValueStoreConfig {
    this.assertNoImportSource();

    const name = this.properties["Name"];

    if (typeof name !== "string") {
      this.refuse("Name must be a string");
    }

    const comment = this.properties["Comment"];

    return {
      name,
      comment: typeof comment === "string" ? comment : undefined,
    };
  }

  private assertNoImportSource(): void {
    if (this.properties["ImportSource"] === undefined) {
      return;
    }

    this.refuse(
      "ImportSource is not simulated, so the store would come up empty " +
        "rather than seeded. Write the keys with PutKey or UpdateKeys on the " +
        "key value store data API instead.",
    );
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::KeyValueStore ${this.resource.logicalId}: ${detail}`,
    );
  }
}
