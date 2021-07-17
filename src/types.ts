type _TupleOf<T, N extends number, R extends unknown[]> = R["length"] extends N ? R : _TupleOf<T, N, [T, ...R]>;
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;

export namespace Ready {
  export type Message = { type: typeof type, error?: string };
  export const type = "ready";
  export const make = (error?: string): Message => (error ? { type, error } : { type });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Windowing {
  export const Enum = {
    Rectangular: 0, 
    Bartlett: 1, 
    Hanning: 2, 
    Hamming: 3, 
    Blackman: 4, 
  } as const;
  
  export type Key = keyof typeof Enum;
  export type Value = typeof Enum[Key];
  export const Default: Key = "Hanning";

  export type Message = ReturnType<typeof make>;
  export const type = "windowing";
  export const make = (windowing: Key) => ({ type, windowing });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Module {
  export type Options = Omit<AnalyserOptions, keyof AudioNodeOptions> & {
    windowing?: Windowing.Key;
  };

  export const optionsKeys: (keyof Required<Options>)[] = [
    "fftSize", "maxDecibels", "minDecibels", "smoothingTimeConstant", "windowing",
  ];

  export type Message = ReturnType<typeof make>;
  export const type = "module";
  export const make = (module: ArrayBuffer, options: Required<Options>) => ({ type, module, options });
  export const check = (message: any): message is Message => message?.type === type;
}

export type Options = Module.Options;

export namespace Time {
  export type Message = ReturnType<typeof make>;
  export const type = "time";
  export const make = (buffer: Uint8Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Frequency {
  export type Message = ReturnType<typeof make>;
  export const type = "frequency";
  export const make = (buffer: Uint8Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export type MessageData = Ready.Message | Module.Message | Time.Message | Frequency.Message;
export const isMessageData = (data: any): data is MessageData =>
  [Ready.check, Module.check, Time.check, Frequency.check, Windowing.check].some(f => f(data));

export const workletId = "custom-worklet";
