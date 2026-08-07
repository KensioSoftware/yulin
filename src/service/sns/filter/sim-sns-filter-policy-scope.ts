import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import { SimSnsAttributeSubject } from "./sim-sns-attribute-subject.js";
import { SimSnsBodySubject } from "./sim-sns-body-subject.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";

/**
 * What part of a published message a filter policy is matched against.
 *
 * There are two, and which one a subscription uses decides what its policy can
 * say: message attributes are a flat set of names, and a message body is a JSON
 * document a policy can nest into.
 */
export abstract class SimSnsFilterPolicyScope {
  /**
   * The name real SNS gives this scope, which is what the attribute is set to.
   */
  abstract get value(): string;

  /**
   * Whether a policy of this scope can name a key nested under another.
   */
  abstract get allowsNestedKeys(): boolean;

  /**
   * The part of a published message a policy of this scope matches against.
   */
  abstract subjectOf(message: SimSnsPublishedMessage): SimSnsFilterSubject;
}

/**
 * The default scope, which matches the message attributes of the publish.
 */
class SimSnsMessageAttributesScope extends SimSnsFilterPolicyScope {
  override get value(): string {
    return "MessageAttributes";
  }

  override get allowsNestedKeys(): boolean {
    return false;
  }

  override subjectOf(message: SimSnsPublishedMessage): SimSnsFilterSubject {
    return SimSnsAttributeSubject.of(message.attributes);
  }
}

/**
 * The scope that matches the message body, read as a JSON document.
 */
class SimSnsMessageBodyScope extends SimSnsFilterPolicyScope {
  override get value(): string {
    return "MessageBody";
  }

  override get allowsNestedKeys(): boolean {
    return true;
  }

  override subjectOf(message: SimSnsPublishedMessage): SimSnsFilterSubject {
    return SimSnsBodySubject.of(message.body.value);
  }
}

/**
 * The scope a subscription filters with unless it says otherwise, which is the
 * one real SNS defaults to.
 */
export const simSnsDefaultFilterPolicyScope: SimSnsFilterPolicyScope =
  new SimSnsMessageAttributesScope();

const scopes: readonly SimSnsFilterPolicyScope[] = [
  simSnsDefaultFilterPolicyScope,
  new SimSnsMessageBodyScope(),
];

/**
 * Read the `FilterPolicyScope` attribute of a request.
 *
 * An empty value is how an attribute is cleared, which puts the subscription
 * back on the default scope. Anything real SNS does not have is refused.
 */
export function simSnsFilterPolicyScopeOf(
  value: string,
): SimSnsFilterPolicyScope {
  if (value === "") {
    return simSnsDefaultFilterPolicyScope;
  }

  const scope = scopes.find((held) => held.value === value);

  if (scope === undefined) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: FilterPolicyScope: ${value} is not a filter policy ` +
        `scope, which is ${scopes.map((held) => held.value).join(" or ")}`,
    );
  }

  return scope;
}
