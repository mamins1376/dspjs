declare module "highlight:*" {
  import { FunctionComponent } from "preact";
  import { JSXInternal } from "preact/src/jsx";
  type Attributes = JSXInternal.IntrinsicElements;

  export const file: string;

  export const start: number;
  export const end: number | undefined;

  export const code: string;

  export const normalized: string;

  export const html: string;

  export const component: FunctionComponent<Attributes["pre"] & Attributes["code"]>;

  export default component;
}
