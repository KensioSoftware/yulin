import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simStatesEffectiveInput,
  simStatesEffectiveOutput,
} from "./sim-states-data-flow.js";

const rawInput = {
  student: { name: "Wei", id: "s-1042" },
  term: 3,
};

describe("Step Functions state data flow", () => {
  it("passes the raw input through where no field narrows it", () => {
    // Given a state with no data-flow fields.
    // When its effective input is worked out.
    const effective = simStatesEffectiveInput(rawInput, {});

    // Then the state sees what it was given.
    assertObjectEquals(effective, rawInput);
  });

  it("narrows the input to what InputPath selects", () => {
    // Given a state reading one field.
    // When its effective input is worked out.
    const effective = simStatesEffectiveInput(rawInput, {
      InputPath: "$.student",
    });

    // Then only that field reaches it.
    assertObjectEquals(effective, { name: "Wei", id: "s-1042" });
  });

  it("gives a state nothing where InputPath is null", () => {
    // Given a state asking for no input.
    // When its effective input is worked out.
    const effective = simStatesEffectiveInput(rawInput, { InputPath: null });

    // Then it sees an empty object.
    assertObjectEquals(effective, {});
  });

  it("builds the task input from Parameters after InputPath", () => {
    // Given a state narrowing its input and then reshaping it.
    // When its effective input is worked out.
    const effective = simStatesEffectiveInput(rawInput, {
      InputPath: "$.student",
      Parameters: {
        "studentId.$": "$.id",
        source: "enrolment",
        nested: { "greeting.$": "States.Format('Hello {}', $.name)" },
      },
    });

    // Then Parameters read what InputPath had already left.
    assertObjectEquals(effective, {
      studentId: "s-1042",
      source: "enrolment",
      nested: { greeting: "Hello Wei" },
    });
  });

  it("resolves a .$ field inside an array in Parameters", () => {
    // Given Parameters holding an array.
    // When its effective input is worked out.
    const effective = simStatesEffectiveInput(rawInput, {
      Parameters: { students: [{ "name.$": "$.student.name" }, "Mei"] },
    });

    // Then the array element was walked too.
    assertObjectEquals(effective, { students: [{ name: "Wei" }, "Mei"] });
  });

  it("replaces the input with the result where no ResultPath is written", () => {
    // Given a state that produced a result.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput(rawInput, { eligible: true }, {});

    // Then the result is all that comes out.
    assertObjectEquals(output, { eligible: true });
  });

  it("keeps the raw input and drops the result where ResultPath is null", () => {
    // Given a state whose result is discarded.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput(
      rawInput,
      { eligible: true },
      {
        ResultPath: null,
      },
    );

    // Then the input passes through untouched.
    assertObjectEquals(output, rawInput);
  });

  it("writes the result into the raw input at ResultPath", () => {
    // Given a state writing its result to a new field.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput(
      rawInput,
      { eligible: true },
      {
        ResultPath: "$.check",
      },
    );

    // Then the input is carried through with the result added.
    assertObjectEquals(output, {
      student: { name: "Wei", id: "s-1042" },
      term: 3,
      check: { eligible: true },
    });
  });

  it("builds the objects a ResultPath needs on the way down", () => {
    // Given a path through fields the input does not have.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput({ term: 3 }, "done", {
      ResultPath: "$.audit.check.status",
    });

    // Then each step of the path was created.
    assertObjectEquals(output, {
      term: 3,
      audit: { check: { status: "done" } },
    });
  });

  it("writes into an array element by index", () => {
    // Given an input holding an array.
    // When a result is written into one of its elements.
    const output = simStatesEffectiveOutput(
      { students: [{ name: "Wei" }] },
      3,
      {
        ResultPath: "$.students[0].term",
      },
    );

    // Then that element carries the result and the array is otherwise intact.
    assertObjectEquals(output, { students: [{ name: "Wei", term: 3 }] });
  });

  it("refuses a ResultPath writing past the end of an array", () => {
    // Given an input holding a one element array.
    // When a result is written to an index the array does not reach.
    const error = assertThrowsError(() =>
      simStatesEffectiveOutput({ students: [{ name: "Wei" }] }, 3, {
        ResultPath: "$.students[2].term",
      }),
    );

    // Then it is refused rather than leaving a hole in the array.
    assertStringIncludes(error.message, "array holding 1");
  });

  it("writes a field named __proto__ as an ordinary field", () => {
    // Given a ResultPath naming a field JavaScript treats specially.
    // When a result is written to it.
    const output = simStatesEffectiveOutput({ term: 3 }, "written", {
      ResultPath: "$['__proto__']",
    });

    // Then it is an own field that serializes, and not a moved prototype.
    assertTrue(Object.hasOwn(output as object, "__proto__"));
    assertIdentical(JSON.stringify(output), '{"term":3,"__proto__":"written"}');
  });

  it("writes a field named toString without reading the one on the prototype", () => {
    // Given a ResultPath through a field every object inherits.
    // When a result is written underneath it.
    const output = simStatesEffectiveOutput({ term: 3 }, "written", {
      ResultPath: "$.toString.value",
    });

    // Then the inherited function was never treated as the value there.
    assertObjectEquals(output, { term: 3, toString: { value: "written" } });
  });

  it("reshapes the result with ResultSelector before ResultPath", () => {
    // Given a task answer wrapped the way lambda:invoke wraps one.
    const taskResult = { StatusCode: 200, Payload: { eligible: true } };

    // When the state unwraps it and writes it into the input.
    const output = simStatesEffectiveOutput(rawInput, taskResult, {
      ResultSelector: { "eligible.$": "$.Payload.eligible" },
      ResultPath: "$.check",
    });

    // Then ResultSelector read the raw result and ResultPath read the input.
    assertObjectEquals(output, {
      student: { name: "Wei", id: "s-1042" },
      term: 3,
      check: { eligible: true },
    });
  });

  it("narrows the output with OutputPath last", () => {
    // Given a state writing a result and then narrowing to it.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput(
      rawInput,
      { eligible: true },
      {
        ResultPath: "$.check",
        OutputPath: "$.check",
      },
    );

    // Then only the narrowed part comes out.
    assertObjectEquals(output, { eligible: true });
  });

  it("gives the next state nothing where OutputPath is null", () => {
    // Given a state discarding its output.
    // When its effective output is worked out.
    const output = simStatesEffectiveOutput(
      rawInput,
      { eligible: true },
      {
        OutputPath: null,
      },
    );

    // Then an empty object comes out.
    assertObjectEquals(output, {});
  });

  it("lets ResultPath keep a field InputPath had taken away", () => {
    // Given a state that saw only part of its input.
    const fields = { InputPath: "$.student", ResultPath: "$.check" };

    // When the effective input and then the effective output are worked out.
    const effective = simStatesEffectiveInput(rawInput, fields);
    const output = simStatesEffectiveOutput(
      rawInput,
      { seen: effective },
      fields,
    );

    // Then the output holds the term the state itself never saw.
    assertObjectEquals(output, {
      student: { name: "Wei", id: "s-1042" },
      term: 3,
      check: { seen: { name: "Wei", id: "s-1042" } },
    });
  });

  it("fails a state whose InputPath or OutputPath selects nothing", () => {
    // Given paths the input has no value at.
    // When the effective input and output are worked out.
    const onInput = assertThrowsError(() =>
      simStatesEffectiveInput(rawInput, { InputPath: "$.absent" }),
    );
    const onOutput = assertThrowsError(() =>
      simStatesEffectiveOutput(rawInput, {}, { OutputPath: "$.absent" }),
    );

    // Then each names the field and the path.
    assertStringIncludes(onInput.message, "InputPath reads $.absent");
    assertStringIncludes(onOutput.message, "OutputPath reads $.absent");
  });

  it("fails a Parameters field whose path selects nothing", () => {
    // Given Parameters reading a field that is not there.
    // When the effective input is worked out.
    const error = assertThrowsError(() =>
      simStatesEffectiveInput(rawInput, {
        Parameters: { "studentId.$": "$.student.absent" },
      }),
    );

    // Then the failure names the field.
    assertStringIncludes(error.message, "studentId.$");
  });

  it("refuses a .$ field whose value is not a string", () => {
    // Given a field ending in .$ holding an object.
    // When the effective input is worked out.
    const error = assertThrowsError(() =>
      simStatesEffectiveInput(rawInput, {
        Parameters: { "studentId.$": { nested: true } },
      }),
    );

    // Then it is refused when the value is read.
    assertStringIncludes(error.message, "has to be a Reference Path");
  });

  it("fails a ResultPath writing a field into something that is not an object", () => {
    // Given an input whose field holds a string.
    // When a result is written underneath it.
    const error = assertThrowsError(() =>
      simStatesEffectiveOutput({ student: "Wei" }, 3, {
        ResultPath: "$.student.term",
      }),
    );

    // Then the failure says the result has nowhere to go.
    assertStringIncludes(error.message, "not an object");
  });

  it("fails a ResultPath writing an index into something that is not an array", () => {
    // Given an input whose field holds an object.
    // When a result is written into it by index.
    const error = assertThrowsError(() =>
      simStatesEffectiveOutput({ students: { name: "Wei" } }, 3, {
        ResultPath: "$.students[0]",
      }),
    );

    // Then the failure says the result has nowhere to go.
    assertStringIncludes(error.message, "not an array");
  });
});

describe("Step Functions Payload Template collisions", () => {
  it("refuses a template building the same field twice", () => {
    // Given a template naming one field plainly and again with .$.
    // When the effective input is worked out.
    const error = assertThrowsError(() =>
      simStatesEffectiveInput(rawInput, {
        Parameters: { studentId: "fixed", "studentId.$": "$.student.id" },
      }),
    );

    // Then it is refused rather than one value silently winning.
    assertStringIncludes(error.message, "both build studentId");
  });
});
