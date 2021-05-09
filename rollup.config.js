import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import scss from "rollup-plugin-scss";
import html, { makeHtmlAttributes } from "@rollup/plugin-html";
import copy from "rollup-plugin-copy";
import commonjs from "@rollup/plugin-commonjs";

const P = !!process.env.DIST_DIR;

var terser, sourcemaps;
terser = sourcemaps = _ => {};

if (P) {
  terser = require("rollup-plugin-terser").terser;
} else {
  sourcemaps = require("rollup-plugin-sourcemaps");
}

const dir = P ? process.env.DIST_DIR : "debug";

let styles = [];

async function template({ attributes, files, meta, publicPath, title }) {
  const [html_attrs, script_attrs, link_attrs] =
    [attributes.html, attributes.script, attributes.link]
    .map(makeHtmlAttributes);

  const scripts = (files.js || [])
    .map(({ fileName }) => fileName)
    .filter(file => file !== "worklet.js")
    .map(file => `<script src="${publicPath}${file}"${script_attrs}></script>`)
    .join("\n    ");

  const links = (files.css || [])
    .map(({ fileName }) =>
      `<link href="${publicPath}${fileName}" rel="stylesheet"${link_attrs}>`)
    .concat([
      "<link rel=\"icon\" href=\"data:;base64,iVBORw0KGgo=\">",
    ])
    .join("\n    ");

  const style_elements = styles
    .map(style => `<style>\n${style}\n    </style>`)
    .join("\n    ");
  styles = [];

  const metas = meta
    .map(makeHtmlAttributes)
    .map(attrs => `<meta${attrs}>`)
    .join("\n    ");

  const html = `<!DOCTYPE html>
<html${html_attrs}>
  <head>
    ${metas}
    <title>${title}</title>
    ${links}
    ${style_elements}
  </head>
  <body>
    ${scripts}
  </body>
</html>`;

  return P ? html.replace(/\n */g, "") : html;
}

export default {
  input: ["src/index.tsx", "src/worklet.js"],
  output: {
    dir,
    sourcemap: !P,
  },
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs(),
    terser({
      toplevel: true,
      ecma: 2016,
      compress: {
        arguments: true,
        unsafe: true,
        pure_getters: true,
        passes: 3,
      },
    }),
    scss({
      output: css => styles.push(css),
      outputStyle: P ? "compressed" : "expanded",
    }),
    sourcemaps(),
    html({
      attributes: { html: { lang: "fa" } },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      title: "DSP Project",
      template,
    }),
    copy({
      targets: [{
        src: "node_modules/nahid-font/dist/Nahid.woff",
        dest: `${dir}/`
      }],
      copyOnce: true,
    }),
  ]
};
