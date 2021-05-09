import Processor from "./processor";

class CustomWorklet extends AudioWorkletProcessor {
  process([input,], [output,], _parameters) {
    const n = input.length; // number of channels

    if (n === 0 || n !== output.length)
      return false;

    if (!this.processors || this.processors.length !== n)
      this.processors = Array(n).fill().map(_ => new Processor(sampleRate));

    this.processors.forEach((p, k) => p.process(input[k], output[k]));

    return true;
  }
}

registerProcessor("custom-worklet", CustomWorklet);
