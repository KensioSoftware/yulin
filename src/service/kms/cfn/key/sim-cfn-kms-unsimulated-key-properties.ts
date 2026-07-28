import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnKmsPropertyParser } from "../sim-cfn-kms-property-parser.js";

interface SimCfnKmsUnsimulatedKeyPropertiesProperties {
  readonly propertyParser: SimCfnKmsPropertyParser;
}

/**
 * Refuses AWS::KMS::Key properties that ask for behaviour simulated KMS does
 * not model.
 *
 * Each of these changes what the key is, not merely how it is described, so
 * quietly ignoring one would leave a template deploying a key that behaves
 * differently here than it would on AWS: rotation that never happens, a
 * multi-Region key whose replica cannot exist, or tags no policy can match.
 * Refusing at deploy time makes that visible where it was declared.
 */
export class SimCfnKmsUnsimulatedKeyProperties {
  private readonly propertyParser: SimCfnKmsPropertyParser;

  constructor(properties: SimCfnKmsUnsimulatedKeyPropertiesProperties) {
    this.propertyParser = properties.propertyParser;
  }

  /**
   * Refuse the Resource if it asks for something unmodelled.
   *
   * KeySpec, KeyUsage and Origin are not checked here: they go through to
   * CreateKey, which already refuses the types this simulation does not
   * create.
   */
  require(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    this.requireNoRotation(resource, properties);
    this.requireSingleRegion(resource, properties);
    this.requireNoTags(resource, properties);
  }

  /**
   * Automatic key rotation is not simulated.
   *
   * `EnableKeyRotation: false` is the AWS default and says nothing, so it is
   * accepted.
   */
  private requireNoRotation(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const enabled = this.propertyParser.optionalBoolean(
      resource,
      properties["EnableKeyRotation"],
      "EnableKeyRotation",
    );

    if (enabled === true) {
      throw this.propertyParser.propertyError(
        resource,
        "EnableKeyRotation is not simulated: simulated KMS keys keep the " +
          "same key material for their lifetime, so a rotated ciphertext " +
          "would not be modelled",
      );
    }

    if (properties["RotationPeriodInDays"] !== undefined) {
      throw this.propertyParser.propertyError(
        resource,
        "RotationPeriodInDays is not simulated: simulated KMS does not " +
          "rotate key material",
      );
    }
  }

  /**
   * Multi-Region keys are not simulated. A simulated key belongs to one
   * account and region, and a ciphertext produced under it cannot be decrypted
   * elsewhere.
   */
  private requireSingleRegion(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const multiRegion = this.propertyParser.optionalBoolean(
      resource,
      properties["MultiRegion"],
      "MultiRegion",
    );

    if (multiRegion === true) {
      throw this.propertyParser.propertyError(
        resource,
        "MultiRegion is not simulated: a simulated key belongs to one " +
          "account and region, and its ciphertext cannot be decrypted in " +
          "another",
      );
    }
  }

  /**
   * Tags are not simulated on KMS keys, so a template declaring them is
   * refused rather than deploying a key whose tags nothing can read and no
   * `aws:ResourceTag` condition can match.
   */
  private requireNoTags(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const tags: SimCfnTemplateValue | undefined = properties["Tags"];

    if (tags !== undefined) {
      throw this.propertyParser.propertyError(
        resource,
        "Tags are not simulated on KMS keys: ListResourceTags and the " +
          "aws:ResourceTag condition key would not see them",
      );
    }
  }
}
