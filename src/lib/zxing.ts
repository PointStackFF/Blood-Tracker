/* ------------------------------------------------------------------ *
 * zxing-wasm decoder bootstrap — the settings here are hard-won (see
 * CLAUDE.md): the JS module and the .wasm binary live in different
 * directories, so the default relative lookup misses and locateFile
 * must be overridden, or loading fails silently. The wasm binary is
 * served from public/zxing-wasm/ as a plain static asset (copied from
 * node_modules/zxing-wasm/dist/reader/zxing_reader.wasm) so serving it
 * never depends on the bundler's asset handling.
 * ------------------------------------------------------------------ */

export interface Decoder {
  readBarcodes: (
    input: ImageData | Blob,
    options?: { maxNumberOfSymbols?: number; minLineCount?: number }
  ) => Promise<{ text?: string; format?: string; bytes?: Uint8Array }[]>;
  wasmVersion: string;
}

let decoderPromise: Promise<Decoder> | null = null;

export function getDecoder(): Promise<Decoder> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      const mod = await import("zxing-wasm/reader");
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? `/zxing-wasm/${path}` : prefix + path,
        },
      });
      return { readBarcodes: mod.readBarcodes, wasmVersion: mod.ZXING_WASM_VERSION ?? "3.1.3" };
    })();
  }
  return decoderPromise;
}
