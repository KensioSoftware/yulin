import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  SimCloudFrontOriginAccessControl,
  type SimCloudFrontOriginAccessControlOriginType,
  type SimCloudFrontOriginAccessControlSigningBehavior,
} from "../../origin-access-control/sim-cf-origin-access-control.js";

/**
 * The values a simulated origin access control accepts for each field of the
 * config that names one of a fixed set.
 *
 * CloudFront also signs for MediaStore and MediaPackage V2 Origins, and neither
 * is modelled, so neither is an origin type here. SigV4 is the only protocol
 * CloudFront offers. Anything else is refused by name rather than stored and
 * treated as though it behaved like one of these.
 */
const originTypes: readonly SimCloudFrontOriginAccessControlOriginType[] = [
  "s3",
  "lambda",
];

const signingProtocols = ["sigv4"] as const;

const signingBehaviors: readonly SimCloudFrontOriginAccessControlSigningBehavior[] =
  ["always", "never", "no-override"];

/**
 * Reads an AWS::CloudFront::OriginAccessControl Resource into a simulated
 * origin access control.
 *
 * Everything the config carries is required by the CloudFormation schema apart
 * from the description, so anything missing is a template AWS would refuse
 * before it reached an origin access control at all.
 */
export class SimCfnCfOriginAccessControlConfig {
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
   * Build the simulated origin access control this Resource describes.
   */
  build(): SimCloudFrontOriginAccessControl {
    const config = this.originAccessControlConfig();

    // The protocol is checked and then dropped: SigV4 is the only one
    // CloudFront offers, so there is nothing for the origin access control to
    // remember about it.
    this.oneOf(config, "SigningProtocol", signingProtocols);

    const description = this.text(config, "Description");

    return new SimCloudFrontOriginAccessControl({
      name:
        this.text(config, "Name") ??
        this.refuse("OriginAccessControlConfig Name must be a string"),
      originType: this.oneOf(
        config,
        "OriginAccessControlOriginType",
        originTypes,
      ),
      signingBehavior: this.oneOf(config, "SigningBehavior", signingBehaviors),
      ...(description !== undefined && { description }),
    });
  }

  private originAccessControlConfig(): Record<string, unknown> {
    const config = this.properties["OriginAccessControlConfig"];

    if (!isRecord(config)) {
      this.refuse("OriginAccessControlConfig must be an object");
    }

    return config;
  }

  /**
   * One field of the config naming a value from a fixed set.
   *
   * A value outside the set is refused by name, along with the set it should
   * have come from, rather than stored and treated as one of them.
   */
  private oneOf<Value extends string>(
    config: Record<string, unknown>,
    key: string,
    values: readonly Value[],
  ): Value {
    // oxlint-disable-next-line security/detect-object-injection
    const value = config[key];

    if (!values.includes(value as Value)) {
      this.refuse(
        `${key} ${String(value)} is not modelled by simulated origin access ` +
          `controls, which accept ${values.join(", ")}`,
      );
    }

    return value as Value;
  }

  /**
   * One string field of the config, or nothing when it is absent.
   */
  private text(
    config: Record<string, unknown>,
    key: string,
  ): string | undefined {
    // oxlint-disable-next-line security/detect-object-injection
    const value = config[key];

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      this.refuse(`OriginAccessControlConfig ${key} must be a string`);
    }

    return value;
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::OriginAccessControl ${this.resource.logicalId}: ${detail}`,
    );
  }
}
