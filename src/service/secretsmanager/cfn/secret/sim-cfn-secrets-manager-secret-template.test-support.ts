import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

interface SecretTemplateProperties {
  readonly name?: string;
  readonly description?: string;
  readonly kmsKeyId?: string;
  readonly tags?: readonly SimCfnTemplateValueRecord[];
  readonly secretString?: string;
  readonly passwordLength?: number;

  /** A second Resource reading the secret through a dynamic reference. */
  readonly reader?: boolean;
}

/**
 * A template holding one secret, and optionally a parameter reading it.
 *
 * The parameter stands in for anything taking a copy of the value when the
 * Stack deploys, such as a CloudFront origin custom header. It reads the secret
 * through the `Fn::Join` shape CDK emits for a secret in the same Stack.
 */
export function secretTemplate(
  properties: SecretTemplateProperties = {},
): CfnTemplateBodyRecord {
  const secret: SimCfnTemplateValueRecord = {
    Type: "AWS::SecretsManager::Secret",
    Properties: secretProperties(properties),
  };

  return {
    Resources:
      properties.reader === true
        ? { EdgeCredential: secret, Reader: readerResource() }
        : { EdgeCredential: secret },
  };
}

function secretProperties(
  properties: SecretTemplateProperties,
): SimCfnTemplateValueRecord {
  const { name, description, kmsKeyId, tags, secretString } = properties;
  const declared: SimCfnTemplateValueRecord = {};

  if (name !== undefined) {
    declared["Name"] = name;
  }

  if (description !== undefined) {
    declared["Description"] = description;
  }

  if (kmsKeyId !== undefined) {
    declared["KmsKeyId"] = kmsKeyId;
  }

  if (tags !== undefined) {
    declared["Tags"] = [...tags];
  }

  if (secretString === undefined) {
    declared["GenerateSecretString"] = {
      SecretStringTemplate: "{}",
      GenerateStringKey: "current",
      PasswordLength: properties.passwordLength ?? 64,
    };
  } else {
    declared["SecretString"] = secretString;
  }

  return declared;
}

function readerResource(): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::SSM::Parameter",
    Properties: {
      Name: "edge-credential-copy",
      Type: "String",
      Value: {
        "Fn::Join": [
          "",
          [
            "{{resolve:secretsmanager:",
            { Ref: "EdgeCredential" },
            ":SecretString:current::}}",
          ],
        ],
      },
    },
  };
}
