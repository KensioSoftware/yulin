import type { SimCloudFrontKeyValueStore } from "../../../../cloudfront/key-value-store/sim-cf-key-value-store.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCloudFrontKeyValueStoreCfnProperties {
  readonly keyValueStore: SimCloudFrontKeyValueStore;
}

/**
 * CloudFormation-facing behavior for an AWS::CloudFront::KeyValueStore
 * Resource.
 */
export class SimCloudFrontKeyValueStoreCfn implements SimCfnResourceValueAdapter {
  private readonly keyValueStore: SimCloudFrontKeyValueStore;

  constructor(properties: SimCloudFrontKeyValueStoreCfnProperties) {
    this.keyValueStore = properties.keyValueStore;
  }

  /**
   * CloudFormation Ref for AWS::CloudFront::KeyValueStore returns the ARN.
   *
   * That is the odd one out among the CloudFront resources here, which Ref to
   * an ID, and it is what makes `Ref` usable straight from a Function's
   * `KeyValueStoreARN`.
   */
  refValue(): SimCfnTemplateValue {
    return this.keyValueStore.arn;
  }

  /**
   * CloudFormation attributes for AWS::CloudFront::KeyValueStore.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.keyValueStore.arn;
      }
      case "Id": {
        return this.keyValueStore.id;
      }
      case "Status": {
        return this.keyValueStore.status;
      }
      default: {
        /* v8 ignore next */
        return `${this.keyValueStore.id}.${attributeName}`;
      }
    }
  }
}
