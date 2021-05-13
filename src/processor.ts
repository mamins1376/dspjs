const pwd = "https://github.com/mamins1376/dspjs/blob/default/src"
export const process_link = pwd + "/processor.ts#L16-L28";

export default class Processor {
  delay: DelayBuffer;

  constructor(rate: number) {
    const duration = 1; // one second delay
    this.delay = new DelayBuffer(Math.ceil(duration * rate));
  }

  process(x: Float32Array, y: Float32Array) {
    // this buffer holds previous samples (d is short for delay)
    const d = this.delay;

    // x is input buffer, y is output buffer:
    //      ┌───┐
    // x ───► + ├─────────────────────┬─► y
    //      └─▲─┘                     │
    //        │  ┌───────┐  ┌──────┐  │
    //       d└──┤ DELAY ◄──┤ -3dB ◄──┘
    //           └───────┘  └──────┘
    for (let i = 0; i < x.length; i++) {
      y[i] = x[i] + d.s;
      d.s = y[i] * 0.707;

      d.advance();
    }
  }

  panic() {
    this.delay.fill(0);
  }
}

class DelayBuffer extends Float32Array {
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
