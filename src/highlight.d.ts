declare module "highlight:*" {
  import { h, FunctionComponent } from "preact";

  export const file: string;

  export const start: number;
  export const end: number | undefined;

  export const code: string;

  export const normalized: string;

  export const html: string;

  type Attributes = h.JSX.IntrinsicElements;
  type Common = Attributes["pre"] & Attributes["code"];
  export const component: FunctionComponent<Common>;

  export default component;
}
