import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";

/**
 * Where something declared against an image sits in it, as ratios of the
 * image's own width and height.
 *
 * The four numbers are the `BoundingBox` real Rekognition reports, in the same
 * units: `left` and `top` are the corner nearest the image origin, and `width`
 * and `height` are the size, each from 0 to 1.
 */
export interface SimRekognitionDeclaredBoundingBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A bounding box as a response carries it.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_BoundingBox.html
 */
export interface SimRekognitionBoundingBoxOutput {
  readonly Left: number;
  readonly Top: number;
  readonly Width: number;
  readonly Height: number;
}

/**
 * Resolves the bounding boxes declared for one label or one face.
 *
 * Values go through `Math.fround` for the same reason confidences do: real
 * ones are float32 values such as `0.26779675483703613`.
 *
 * A box has to sit inside the image. Real Rekognition can return a box that
 * does not, for an object at the image edge that is only partly visible, so
 * this is stricter than AWS. It is the check that catches a box written in
 * pixels, which is the mistake worth catching: a `left` of 350 would otherwise
 * be reported as a face 350 image widths from the left.
 */
export class SimRekognitionBoundingBoxes {
  constructor(private readonly subject: string) {}

  /**
   * Resolve one declared bounding box.
   */
  of(box: SimRekognitionDeclaredBoundingBox): SimRekognitionBoundingBoxOutput {
    const resolved = {
      Left: this.ratio("left", box.left),
      Top: this.ratio("top", box.top),
      Width: this.ratio("width", box.width),
      Height: this.ratio("height", box.height),
    };

    this.refuseOverflow("left", box.left, "width", box.width);
    this.refuseOverflow("top", box.top, "height", box.height);

    return resolved;
  }

  private ratio(part: string, value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new SimRekognitionDeclarationError(
        `A bounding box declared for '${this.subject}' has a ${part} of ` +
          `${String(value)}, which is not a ratio of the image size from 0 ` +
          `to 1.`,
      );
    }

    return Math.fround(value);
  }

  private refuseOverflow(
    corner: string,
    cornerValue: number,
    size: string,
    sizeValue: number,
  ): void {
    if (cornerValue + sizeValue <= 1) {
      return;
    }

    throw new SimRekognitionDeclarationError(
      `A bounding box declared for '${this.subject}' has a ${corner} of ` +
        `${String(cornerValue)} and a ${size} of ${String(sizeValue)}, which ` +
        `puts it outside the image.`,
    );
  }
}
