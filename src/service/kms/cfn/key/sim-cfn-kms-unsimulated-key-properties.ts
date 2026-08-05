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
 * Records the AWS::KMS::Key properties that ask for behaviour simulated KMS
 * does not model.
 *
 * Each of these changes what the key is, not merely how it is described, so
 * dropping one without a word would leave a template deploying a key that
 * behaves differently here than it would on AWS: rotation that never happens,
 * a multi-Region key whose replica cannot exist, or tags no policy can match.
 * None of them stops a key existing and encrypting, though, so the key is
 * created without them and each one is recorded against the Resource, where a
 * test written against the behaviour can find out it was never configured.
 */
export class SimCfnKmsUnsimulatedKeyProperties {
  private readonly propertyParser: SimCfnKmsPropertyParser;

  constructor(properties: SimCfnKmsUnsimulatedKeyPropertiesProperties) {
    this.propertyParser = properties.propertyParser;
  }

  /**
   * Record everything unmodelled the Resource asks for.
   *
   * KeySpec, KeyUsage and Origin are not checked here: they go through to
   * CreateKey, which already refuses the types this simulation does not
   * create.
   */
  apply(resource: SimCfnResource, properties: SimCfnTemplateValueRecord): void {
    this.applyToRotation(resource, properties);
    this.applyToRegion(resource, properties);
    this.applyToTags(resource, properties);
  }

  /**
   * Automatic key rotation is not simulated.
   *
   * `EnableKeyRotation: false` is the AWS default and says nothing, so there
   * is nothing to record for it.
   */
  private applyToRotation(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const enabled = this.propertyParser.optionalBoolean(
      resource,
      properties["EnableKeyRotation"],
      "EnableKeyRotation",
    );

    if (enabled === true) {
      resource.ignoreProperty(
        "EnableKeyRotation",
        "EnableKeyRotation is not simulated: simulated KMS keys keep the " +
          "same key material for their lifetime, so the key is created " +
          "without rotation and a rotated ciphertext is not modelled",
      );
    }

    if (properties["RotationPeriodInDays"] !== undefined) {
      resource.ignoreProperty(
        "RotationPeriodInDays",
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
  private applyToRegion(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const multiRegion = this.propertyParser.optionalBoolean(
      resource,
      properties["MultiRegion"],
      "MultiRegion",
    );

    if (multiRegion === true) {
      resource.ignoreProperty(
        "MultiRegion",
        "MultiRegion is not simulated: the key is created in one account and " +
          "region, and its ciphertext cannot be decrypted in another",
      );
    }
  }

  /**
   * Tags are not simulated on KMS keys, so a template declaring them deploys a
   * key whose tags nothing can read and no `aws:ResourceTag` condition can
   * match. That is worth recording, since a policy written around one would
   * match nothing here and match on AWS.
   */
  private applyToTags(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const tags: SimCfnTemplateValue | undefined = properties["Tags"];

    if (tags !== undefined) {
      resource.ignoreProperty(
        "Tags",
        "Tags are not simulated on KMS keys: ListResourceTags and the " +
          "aws:ResourceTag condition key do not see them",
      );
    }
  }
}
