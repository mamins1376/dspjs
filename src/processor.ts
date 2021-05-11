export default class Processor {
  delay: Float32Array;
  pointer: number = 0;

  constructor(rate: number) {
    const delay = 4;
    this.delay = new Float32Array(Math.ceil(delay * rate));
  }

  process(x: Float32Array, y: Float32Array) {
    const d = this.delay;
    let p = this.pointer;
    for (let i = 0; i < x.length; i++) {
      y[i] = x[i] + d[p];
      d[p] = y[i] * 0.9;

      p += 1;
      if (p == d.length)
        p = 0;
    }
    this.pointer = p;
  }
}
