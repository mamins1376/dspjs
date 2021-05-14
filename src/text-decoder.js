if (!(globalThis?.TextDecoder)) {
  globalThis.TextDecoder = new Function();
  globalThis.TextDecoder.prototype.decode = array =>
    array?.reduce((str, code) => (str + String.fromCharCode(code)));
}
