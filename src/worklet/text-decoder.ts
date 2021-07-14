// TextDecoder does not exist in AudioWorkletGlobalScope and wasm-bindgen needs it.

class TextDecoderShim implements TextDecoder {
  readonly encoding = "utf-8";
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(label?: string, options?: TextDecoderOptions) {
    if (label && label.toLowerCase() !== "utf-8") 
      throw new TypeError(`unsupported encoding: ${label}`)

    this.fatal = options?.fatal ?? true;
    if (!this.fatal)
      throw new TypeError("only fatal decoding mode is supported");

    this.ignoreBOM = options?.ignoreBOM ?? true;
    if (!this.ignoreBOM)
      throw new TypeError("ignoreBOM must be enabled");
  }

  decode(view?: BufferSource, _options?: TextDecodeOptions): string {
    if (!view)
      return "";

    if (!ArrayBuffer.isView(view))
      throw new TypeError('passed argument must be an array buffer view');

    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const arrays = Array.from(bytes).map((byte: number) => String.fromCharCode(byte));
    return decodeURIComponent(escape(arrays.join("")));
  }
}

globalThis.TextDecoder ??= TextDecoderShim as any;
