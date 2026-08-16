import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolSchema } from "../schema/sim-cognito-user-pool-schema.js";
import type { SimCognitoAttributeType } from "../user/sim-cognito-user-attributes.js";
import type { SimCognitoExternalUser } from "./sim-cognito-external-user.js";

/**
 * How a provider's claims are mapped onto pool attributes, as a request sets
 * it and a described provider reports it.
 *
 * The key is the pool attribute and the value is the provider's claim, which
 * is the direction real Cognito reads it in and the one most easily got
 * backwards.
 */
export type SimCognitoAttributeMappingType = Readonly<Record<string, string>>;

/**
 * What a provider's claims become on the pool user signing in.
 *
 * A claim the mapping says nothing about is dropped, as it is on real Cognito:
 * an attribute reaches a user only where something mapped it there. A mapped
 * claim the provider did not send is left alone rather than written empty.
 */
export class SimCognitoAttributeMapping {
  private readonly mapping: SimCognitoAttributeMappingType;
  private readonly schema: SimCognitoUserPoolSchema;

  constructor(
    mapping: SimCognitoAttributeMappingType | undefined,
    schema: SimCognitoUserPoolSchema,
  ) {
    this.mapping = { ...mapping };
    this.schema = schema;
    this.requireMappedNames();
  }

  /**
   * This mapping as a described provider reports it.
   */
  toOutput(): SimCognitoAttributeMappingType {
    return { ...this.mapping };
  }

  /**
   * The attributes an external user's claims map onto.
   */
  attributesFor(
    externalUser: SimCognitoExternalUser,
  ): readonly SimCognitoAttributeType[] {
    return Object.entries(this.mapping)
      .map(([attributeName, claimName]) => ({
        Name: attributeName,
        Value: externalUser.claim(claimName),
      }))
      .filter((attribute) => attribute.Value !== undefined);
  }

  /**
   * Refuse a mapping onto an attribute the pool's schema does not hold.
   *
   * A `custom:` attribute the pool declared is as good a target as a standard
   * one, and one it did not declare is refused here rather than during a
   * sign-in much later, which is where writing the attribute would otherwise
   * catch it.
   *
   * `username` is refused with its own message: real Cognito builds a
   * federated user's username from the provider and the subject, and a mapping
   * cannot change it.
   */
  private requireMappedNames(): void {
    for (const attributeName of Object.keys(this.mapping)) {
      if (attributeName === "username") {
        throw new SimCognitoInvalidParameterException(
          "AttributeMapping cannot map to 'username': Cognito builds a " +
            "federated user's username from the provider name and the " +
            "subject it signed in with",
        );
      }

      if (!this.schema.holds(attributeName)) {
        throw new SimCognitoInvalidParameterException(
          `AttributeMapping '${attributeName}' is not in the pool's schema: ` +
            `${this.schema.describeHolding()}, so there is nothing for the ` +
            `provider's claim to be mapped onto`,
        );
      }
    }
  }
}
