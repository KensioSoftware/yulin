import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import { SimCfnCfKeyValueStoreConfigReader } from "./sim-cfn-cf-kvs-config.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnCfKeyValueStoreCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated key value stores from AWS::CloudFront::KeyValueStore
 * Resources.
 *
 * Creation goes through the same CreateKeyValueStore command an SDK caller
 * uses, so a duplicate name is refused here the way it is there, and the store
 * provisions in the background the same way.
 */
export class SimCfnCfKeyValueStoreCreator {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfKeyValueStoreCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create the key value store one Resource describes.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimCloudFrontKeyValueStore> {
    const config = new SimCfnCfKeyValueStoreConfigReader({
      resource,
      properties,
    }).read();

    const created = await this.cloudFront.keyValueStores().createKeyValueStore(
      {
        input: {
          Name: config.name,
          ...(config.comment !== undefined && { Comment: config.comment }),
        },
      },
      options,
    );

    const store = this.cloudFront
      .keyValueStores()
      .byId(created.KeyValueStore.Id);

    assertDefined(
      store,
      `sim CloudFront key value store ${config.name} for CloudFormation ` +
        `Resource ${resource.logicalId}`,
    );

    return store;
  }

  /**
   * Remove a key value store created from a Resource.
   *
   * The ETag is read from the store rather than carried from creation, because
   * anything written to it since will have moved the one creation returned.
   * Tearing a Stack down is not the place to make a caller thread that through.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const store = resource.simResource as
      | SimCloudFrontKeyValueStore
      | undefined;

    if (store === undefined) {
      return;
    }

    await this.cloudFront
      .keyValueStores()
      .deleteKeyValueStore(
        { input: { Name: store.name, IfMatch: store.resourceETag } },
        options,
      );
  }
}
