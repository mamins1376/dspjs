declare module "highlight:*" {
  import { FunctionComponent } from "preact";
  import { JSXInternal } from "preact/src/jsx";
  type Attributes = JSXInternal.IntrinsicElements;
  const component: FunctionComponent<Attributes["pre"] & Attributes["code"]>;
  export const file: string;
  export const range: [number, number | undefined];
  export default component;
}
