/* eslint-disable no-secrets/no-secrets -- base64 image files, not secrets. */
import { SimRekognitionSampleImage } from "./sim-rekognition-sample-image.js";

/**
 * The images that ship with simulated Rekognition.
 *
 * Each is a real 16 by 16 PNG or JPEG, so the format check reads the same
 * magic bytes from a sample image as from any other image and there is no
 * path around it. Three are PNG and two are JPEG, which is the pair of formats
 * Rekognition accepts.
 *
 * They are 1,909 bytes in total, held here as base64. What they are pictures
 * of decides nothing: no image is looked at, and each one answers from the
 * rule registered against its hash. They are pictures of something anyway,
 * because an image that reads as a photograph of a landscape is easier to
 * follow in a test than a rectangle of one colour.
 *
 * The bytes are fixed. Re-encoding one would change its hash and leave the
 * built-in rule matching nothing, so they are checked in as they are rather
 * than generated at build time.
 */
export const simRekognitionSampleImageFiles = {
  passesModeration: new SimRekognitionSampleImage(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR42mMwTp" +
      "tJEmKgo4ZPz07iQaMaho+GQZP4ABIcwWyZg5lwAAAAAElFTkSuQmCC",
  ),
  flaggedByModeration: new SimRekognitionSampleImage(
    "/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQ" +
      "UBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9" +
      "AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJi" +
      "coKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG" +
      "h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19" +
      "jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAEC" +
      "AwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcR" +
      "MiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZH" +
      "SElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoq" +
      "OkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP0" +
      "9fb3+Pn6/9sAQwAEBAQEBAQGBAQGCQYGBgkMCQkJCQwPDAwMDAwPEg8PDw8PDx" +
      "ISEhISEhISFRUVFRUVGRkZGRkcHBwcHBwcHBwc/9sAQwEEBQUHBwcMBwcMHRQQ" +
      "FB0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR" +
      "0dHR0d/90ABAAB/9oADAMBAAIRAxEAPwDwL7//AE08z95+848zH/LWX+7Ev8K9" +
      "6Pv/APTTzP3n7zjzMf8ALWX+7Ev8K96Pv/8ATTzP3n7zjzMf8tZf7sS/wr3o+/" +
      "8A9NPM/efvOPMx/wAtZf7sS/wr3rxv6/r+vutp+l7/ANf8P387363/AHn/2Q==",
  ),
  noFaces: new SimRekognitionSampleImage(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAG0lEQVR42mNo3/" +
      "uCJMQwqmGIavDvsicJjUgNAOxJxJC8NL++AAAAAElFTkSuQmCC",
  ),
  oneFace: new SimRekognitionSampleImage(
    "/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQ" +
      "UBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9" +
      "AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJi" +
      "coKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG" +
      "h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19" +
      "jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAEC" +
      "AwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcR" +
      "MiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZH" +
      "SElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoq" +
      "OkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP0" +
      "9fb3+Pn6/9sAQwAEBAQEBAQGBAQGCQYGBgkMCQkJCQwPDAwMDAwPEg8PDw8PDx" +
      "ISEhISEhISFRUVFRUVGRkZGRkcHBwcHBwcHBwc/9sAQwEEBQUHBwcMBwcMHRQQ" +
      "FB0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR" +
      "0dHR0d/90ABAAB/9oADAMBAAIRAxEAPwD2ZF3sF6ZoddjFeuK8bHivXwci6x/w" +
      "BP8A4mg+K9fJybrP/AE/+Jrp/wBZaPtub3uS21lvfe9+x8jy0/YcvL799/K21v" +
      "U//9k=",
  ),
  severalFaces: new SimRekognitionSampleImage(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAMElEQVR42mNo3/" +
      "uCJMQwJDQ82DAJgnBqQFNBqQY0LjU04PcS4VBC1+DfZU8SGpEaAJaDwyjublVb" +
      "AAAAAElFTkSuQmCC",
  ),
};
