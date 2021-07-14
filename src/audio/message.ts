export namespace Ready {
  export type Message = ReturnType<typeof make>;
  export const type = "ready";
  export const make = (error?: string) => ({ type, error });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Module {
  export type Message = ReturnType<typeof make>;
  export const type = "module";
  export const make = (module: ArrayBuffer) => ({ type, module });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Panic {
  export type Message = ReturnType<typeof make>;
  export const type = "panic";
  export const make = () => ({ type });
  export const check = (message: any): message is Message => message?.type === type;
}

export type MessageData = Ready.Message | Panic.Message | Module.Message;
export const isMessageData = (data: any): data is MessageData =>
  [Ready.check, Panic.check, Module.check].some(f => f(data));

export const workletId = "custom-worklet";
