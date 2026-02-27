import { ClipboardReader, ClipboardFormat } from "./types";

/**
 * Tries each reader in order. The first reader whose operation succeeds wins.
 * If all readers fail, throws an aggregate error with details from each.
 */
export class FallbackClipboardReader implements ClipboardReader {
  private readers: ClipboardReader[];

  constructor(readers: ClipboardReader[]) {
    if (readers.length === 0) {
      throw new Error("FallbackClipboardReader requires at least one reader");
    }
    this.readers = readers;
  }

  requiredTool(): string {
    return this.readers.map((r) => r.requiredTool()).join(" or ");
  }

  async isToolAvailable(): Promise<boolean> {
    for (const reader of this.readers) {
      if (await reader.isToolAvailable()) {
        return true;
      }
    }
    return false;
  }

  async hasImage(): Promise<boolean> {
    for (const reader of this.readers) {
      try {
        if (await reader.hasImage()) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const errors: Error[] = [];
    for (const reader of this.readers) {
      try {
        return await reader.detectFormat();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    throw new AggregateError(
      errors,
      `All clipboard readers failed to detect format: ${errors.map((e) => e.message).join("; ")}`,
    );
  }

  async readImage(): Promise<Buffer> {
    const errors: Error[] = [];
    for (const reader of this.readers) {
      try {
        if (!(await reader.isToolAvailable())) {
          errors.push(
            new Error(`${reader.requiredTool()}: tool not available`),
          );
          continue;
        }
        return await reader.readImage();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    throw new AggregateError(
      errors,
      `All clipboard readers failed: ${errors.map((e) => e.message).join("; ")}`,
    );
  }
}
