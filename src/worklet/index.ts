/// <reference path="../../node_modules/types-web/baselines/audioworklet.generated.d.ts" />

import "./decoder";

import { Frequency, isMessageData, Module, Ready, Time, Windowing, workletId } from "../types";

import initialize, { Analyzer } from "../../target/wasm-pack/wasm";

class CustomWorklet extends AudioWorkletProcessor {
  analyzer?: Analyzer;
  options?: Required<Module.Options>;

  constructor() {
    super();

    this.port.addEventListener("message", this.message.bind(this));
    this.port.start();
  }

  message({ data }: MessageEvent) {
    if (!isMessageData(data))
      throw new TypeError(`Invalid message data on worklet thread: ${data}`)

    if (Module.check(data)) {
      const ready = (error?: string) => this.port.postMessage(Ready.make(error));
      initialize(data.module)
        .then(() => ready())
        .catch((reason: string) => ready(reason));
      this.options = data.options;
    }

    if (Windowing.check(data) && this.analyzer)
      this.analyzer.change_windowing(Windowing.Enum[data.windowing]);
  }

  process([input]: Float32Array[][]) {
    if (this.options && input.length) {
      this.analyzer ??= new Analyzer(
        this.options.fftSize,
        this.options.maxDecibels,
        this.options.minDecibels,
        this.options.smoothingTimeConstant,
        Windowing.Enum[this.options.windowing],
      );

      if (this.analyzer.feed(input[0])) {
        let buffer = new Uint8Array(this.options.fftSize);
        this.analyzer.time(buffer);
        this.port.postMessage(Time.make(buffer), [buffer.buffer]);

        buffer = new Uint8Array(this.options.fftSize >> 1);
        this.analyzer.frequency(buffer);
        this.port.postMessage(Frequency.make(buffer), [buffer.buffer]);
      }
    }

    return true;
  }
}

registerProcessor(workletId, CustomWorklet as any);
