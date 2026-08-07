import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";

/**
 * The sections of a ResponseHeadersPolicyConfig this simulation does not model.
 *
 * Each of these turns into response headers of its own, so ignoring one would
 * serve a response missing headers the policy promised. A CORS section that
 * quietly does nothing is the worst of them, because the request it breaks is
 * one a browser makes and a test does not.
 */
const unmodelledSections = [
  "CorsConfig",
  "SecurityHeadersConfig",
  "ServerTimingHeadersConfig",
] as const;

/**
 * Reads an AWS::CloudFront::ResponseHeadersPolicy Resource into a simulated
 * policy.
 *
 * Only the custom headers and the removed headers are modelled. The other
 * sections are refused by name rather than stepped over, so a policy that would
 * serve different headers here than in AWS fails where it is written.
 */
export class SimCfnCfResponseHeadersPolicyConfig {
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
   * Build the simulated policy this Resource describes.
   */
  build(): SimCloudFrontResponseHeadersPolicy {
    const config = this.policyConfig();

    this.assertModelled(config);

    return new SimCloudFrontResponseHeadersPolicy({
      name: this.policyName(config),
      customHeaders: this.customHeaders(config),
      headersToRemove: this.headersToRemove(config),
    });
  }

  private policyConfig(): Record<string, unknown> {
    const config = this.properties["ResponseHeadersPolicyConfig"];

    if (!isRecord(config)) {
      this.refuse(`ResponseHeadersPolicyConfig must be an object`);
    }

    return config;
  }

  private assertModelled(config: Record<string, unknown>): void {
    for (const section of unmodelledSections) {
      // oxlint-disable-next-line security/detect-object-injection
      if (config[section] !== undefined) {
        this.refuse(
          `${section} is not modelled by simulated response headers ` +
            `policies, so the headers it sets would be missing from the ` +
            `response`,
        );
      }
    }
  }

  private policyName(config: Record<string, unknown>): string {
    const name = config["Name"];

    if (typeof name !== "string") {
      this.refuse(`ResponseHeadersPolicyConfig Name must be a string`);
    }

    return name;
  }

  private customHeaders(
    config: Record<string, unknown>,
  ): SimCloudFrontResponseHeader[] {
    return this.configItems(config, "CustomHeadersConfig").map((item) => {
      if (!isRecord(item)) {
        this.refuse(`CustomHeadersConfig items must be objects`);
      }

      return this.customHeader(item);
    });
  }

  private customHeader(
    item: Record<string, unknown>,
  ): SimCloudFrontResponseHeader {
    const name = item["Header"];
    const value = item["Value"];

    if (typeof name !== "string" || typeof value !== "string") {
      this.refuse(`CustomHeadersConfig items need a string Header and Value`);
    }

    // Override is required by the CloudFormation schema, so anything else here
    // is a template that would be refused before it reached a policy at all.
    const override = item["Override"];

    if (typeof override !== "boolean") {
      this.refuse(`CustomHeadersConfig item ${name} needs a boolean Override`);
    }

    return new SimCloudFrontResponseHeader({ name, value, override });
  }

  private headersToRemove(config: Record<string, unknown>): string[] {
    return this.configItems(config, "RemoveHeadersConfig").map((item) => {
      const name = isRecord(item) ? item["Header"] : undefined;

      if (typeof name !== "string") {
        this.refuse(`RemoveHeadersConfig items need a string Header`);
      }

      return name;
    });
  }

  /**
   * The `Items` of one `<name>Config` section, or nothing when it is absent.
   */
  private configItems(
    config: Record<string, unknown>,
    sectionName: string,
  ): unknown[] {
    // oxlint-disable-next-line security/detect-object-injection
    const section = config[sectionName];

    if (section === undefined) {
      return [];
    }

    if (!isRecord(section)) {
      this.refuse(`${sectionName} must be an object`);
    }

    const items = section["Items"];

    if (items === undefined) {
      return [];
    }

    if (!Array.isArray(items)) {
      this.refuse(`${sectionName} Items must be an array`);
    }

    return items;
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::ResponseHeadersPolicy ${this.resource.logicalId}: ${detail}`,
    );
  }
}
