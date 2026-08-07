import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  SimCloudFrontOriginAccessControl,
  type SimCloudFrontOriginAccessControlSigningBehavior,
} from "../../origin-access-control/sim-cf-origin-access-control.js";

/**
 * The config values a simulated origin access control is fixed to.
 *
 * CloudFront also signs for MediaStore, MediaPackage V2 and Lambda Function URL
 * Origins, and none of those is modelled. SigV4 is the only protocol CloudFront
 * offers. Anything else is refused by name rather than stored and treated as
 * though it behaved like these.
 */
const fixedValues = {
  OriginAccessControlOriginType: "s3",
  SigningProtocol: "sigv4",
};

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

    this.assertFixedValues(config);

    const description = this.text(config, "Description");

    return new SimCloudFrontOriginAccessControl({
      name:
        this.text(config, "Name") ??
        this.refuse("OriginAccessControlConfig Name must be a string"),
      signingBehavior: this.signingBehavior(config),
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
   * Refuse a config asking for anything but the one origin type and protocol a
   * simulated origin access control signs.
   */
  private assertFixedValues(config: Record<string, unknown>): void {
    for (const [key, fixed] of Object.entries(fixedValues)) {
      // oxlint-disable-next-line security/detect-object-injection
      const value = config[key];

      if (value !== fixed) {
        this.refuse(
          `${key} ${String(value)} is not modelled by simulated origin ` +
            `access controls, which only sign an ${fixedValues.OriginAccessControlOriginType} Origin with ${fixedValues.SigningProtocol}`,
        );
      }
    }
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

  private signingBehavior(
    config: Record<string, unknown>,
  ): SimCloudFrontOriginAccessControlSigningBehavior {
    const value = config["SigningBehavior"];

    if (!isSigningBehavior(value)) {
      this.refuse(
        `SigningBehavior ${String(value)} is not one of ${signingBehaviors.join(
          ", ",
        )}`,
      );
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

function isSigningBehavior(
  value: unknown,
): value is SimCloudFrontOriginAccessControlSigningBehavior {
  return signingBehaviors.includes(
    value as SimCloudFrontOriginAccessControlSigningBehavior,
  );
}
