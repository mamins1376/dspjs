const pwd = "https://github.com/mamins1376/dspjs/blob/default/src"
export const process_link = pwd + "/processor.ts#L12-L21";

export default class Processor {
  buffer: RingBuffer;

  constructor(rate: number) {
    const delay = 2; // two seconds delay
    this.buffer = new RingBuffer(Math.ceil(delay * rate));
  }

  process(x: Float32Array, y: Float32Array) {
    const d = this.buffer;

    for (let i = 0; i < x.length; i++) {
      y[i] = x[i] + d.s;
      d.s = y[i] * 0.6;

      d.advance();
    }
  }

  panic() {
    this.buffer.fill(0);
  }
}

class RingBuffer extends Float32Array {
  pointer: number = 0;

  get s() {
    return this[this.pointer];
  }

  set s(value: number) {
    this[this.pointer] = value;
  }

  advance() {
    ((++this.pointer) < this.length) || (this.pointer -= this.length);
  }
}
