import { assertFalse, assertTrue, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfnParameterStoreValueType } from "./sim-cfn-parameter-store-value-type.js";

describe("simCfnParameterStoreValueType", () => {
  it("reads a String value type as one value", () => {
    // Given the type CDK emits for a parameter read without a version.
    const declaredType = "AWS::SSM::Parameter::Value<String>";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then the value it names is a single string.
    assertFalse(valueType?.list);
  });

  it("reads a List value type as a list", () => {
    // Given the type a StringList parameter is read through.
    const declaredType = "AWS::SSM::Parameter::Value<List<String>>";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then the stored value is to be split into a list.
    assertTrue(valueType?.list);
  });

  it("reads a CommaDelimitedList value type as a list", () => {
    // Given the other list form CloudFormation accepts.
    const declaredType = "AWS::SSM::Parameter::Value<CommaDelimitedList>";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then it names a list too.
    assertTrue(valueType?.list);
  });

  it("reads an EC2 value type as one value", () => {
    // Given a value type naming an EC2 resource, which simulated Parameter
    // Store can hold the identifier of without simulating the resource.
    const declaredType = "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then it is read as the string it is, unvalidated.
    assertFalse(valueType?.list);
  });

  it("reads a type holding its own value as no value type", () => {
    // Given a Parameter whose value is in the template.
    const declaredType = "CommaDelimitedList";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then nothing is read from Parameter Store for it.
    assertUndefined(valueType);
  });

  it("reads an unclosed value type as no value type", () => {
    // Given a type that names no inner type at all.
    const declaredType = "AWS::SSM::Parameter::Value<String";

    // When the type is read.
    const valueType = simCfnParameterStoreValueType(declaredType);

    // Then it is left alone rather than guessed at.
    assertUndefined(valueType);
  });

  it("reads a Parameter with no type as no value type", () => {
    // Given a Parameter definition declaring no Type.
    // When the missing type is read.
    const valueType = simCfnParameterStoreValueType(undefined);

    // Then nothing is read from Parameter Store for it.
    assertUndefined(valueType);
  });
});
