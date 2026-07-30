import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import { SimCfnCognitoClientCreator } from "./client/sim-cfn-cognito-client-creator.js";
import { SimCfnCognitoGroupCreator } from "./group/sim-cfn-cognito-group-creator.js";
import { SimCfnCognitoUserPoolCreator } from "./user-pool/sim-cfn-cognito-user-pool-creator.js";

interface SimCognitoCfnResourceFactoryProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * CloudFormation Resource factory for simulated Cognito resources.
 */
export class SimCognitoCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly userPoolCreator: SimCfnCognitoUserPoolCreator;
  private readonly clientCreator: SimCfnCognitoClientCreator;
  private readonly groupCreator: SimCfnCognitoGroupCreator;

  constructor(properties: SimCognitoCfnResourceFactoryProperties) {
    const { cognito } = properties;

    this.userPoolCreator = new SimCfnCognitoUserPoolCreator({ cognito });
    this.clientCreator = new SimCfnCognitoClientCreator({ cognito });
    this.groupCreator = new SimCfnCognitoGroupCreator({ cognito });
  }

  /**
   * Create a simulated Cognito resource from a CloudFormation Resource.
   *
   * The hosted UI, identity providers, resource servers and the user Resource
   * types are not simulated, so their Resource types are reported as
   * unsupported rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "UserPool": {
        return await this.userPoolCreator.create(resource, properties);
      }
      case "UserPoolClient": {
        return await this.clientCreator.create(resource, properties);
      }
      case "UserPoolGroup": {
        return await this.groupCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim Cognito CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
