// TextDecoder does not exist in AudioWorkletGlobalScope and wasm-bindgen needs it.

class TextDecoderShim implements TextDecoder {
  readonly encoding: string;
  readonly fatal = false;
  readonly ignoreBOM = true;

  constructor(label?: string | undefined, _options?: TextDecodeOptions | undefined) {
    this.encoding = label ?? "utf-8";
  }

  decode(input?: BufferSource | undefined, _options?: TextDecodeOptions | undefined): string {
    return Array.prototype.reduce.bind(input)((str, code) => (str + String.fromCharCode(code)), "");
  }
}

globalThis.TextDecoder ??= TextDecoderShim as any;
