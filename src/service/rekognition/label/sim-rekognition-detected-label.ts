import type {
  SimRekognitionLabelNameOutput,
  SimRekognitionLabelOutput,
} from "../command/detect-labels/detect-labels.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import type { SimRekognitionDeclaredLabel } from "./sim-rekognition-label-declaration.js";
import { SimRekognitionLabelInstances } from "./sim-rekognition-label-instances.js";

/**
 * The confidence a declared label carries when none is declared for it.
 *
 * It is a value from an AWS DetectLabels example response rather than a round
 * number, because declared confidences pass through Math.fround and a real one
 * has the float32 tail a test can assert on.
 */
const labelConfidence = new SimRekognitionDeclaredConfidence(97.530106);

/**
 * The parents, aliases or categories declared for a label, as a response
 * carries them.
 *
 * All three are a list of names on the wire, so all three are checked the same
 * way: a name with nothing in it is refused where it was declared rather than
 * reported as a nameless parent.
 */
function named(
  labelName: string,
  kind: string,
  declared: readonly string[] | undefined,
): readonly SimRekognitionLabelNameOutput[] {
  return (declared ?? []).map((name) => {
    if (name.length === 0) {
      throw new SimRekognitionDeclarationError(
        `A declared ${kind} for '${labelName}' has no name of its own`,
      );
    }

    return { Name: name };
  });
}

/**
 * One declared label, as a response carries it.
 *
 * Nothing here is filled in from the label name. Yulin ships no general label
 * ontology, so a label arrives with the parents, aliases, categories and
 * instances its declaration gave it and with none otherwise.
 */
export function simRekognitionDetectedLabel(
  declared: SimRekognitionDeclaredLabel,
): SimRekognitionLabelOutput {
  if (declared.name.length === 0) {
    throw new SimRekognitionDeclarationError(
      "A simulated Rekognition label declaration needs a label name",
    );
  }

  const confidence = labelConfidence.of(declared.name, declared.confidence);

  return {
    Name: declared.name,
    Confidence: confidence,
    Parents: named(declared.name, "parent", declared.parents),
    Aliases: named(declared.name, "alias", declared.aliases),
    Categories: named(declared.name, "category", declared.categories),
    Instances: new SimRekognitionLabelInstances(
      declared.name,
      confidence,
    ).resolve(declared.instances ?? []),
  };
}
