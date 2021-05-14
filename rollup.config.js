import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import scss from "rollup-plugin-scss";
import html, { makeHtmlAttributes } from "@rollup/plugin-html";
import copy from "rollup-plugin-copy";
import commonjs from "@rollup/plugin-commonjs";
import rust from "@wasm-tool/rollup-plugin-rust";

const production = !process.env.ROLLUP_WATCH;

var terser, sourcemaps, serve, livereload;
terser = sourcemaps = serve = livereload = _ => null;

if (production) {
  terser = require("rollup-plugin-terser").terser;
} else {
  sourcemaps = require("rollup-plugin-sourcemaps");
  serve = require("rollup-plugin-serve");
  livereload = require("rollup-plugin-livereload");
}

const dir = process.env.DIST_DIR || "dist";

let styles = [];

async function template({ attributes, files, meta, publicPath, title }) {
  const [html_attrs, script_attrs, link_attrs] =
    [attributes.html, attributes.script, attributes.link]
    .map(makeHtmlAttributes);

  const scripts = (files.js || [])
    .map(({ fileName }) => fileName)
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

  return production ? html.replace(/\n */g, "") : html;
}

/** @type {import("rollup").RollupOutput} */
const output = {
  dir,
  sourcemap: !production,
  format: "iife",
};

const terser_options = {
  toplevel: true,
  ecma: 2016,
  compress: {
    arguments: true,
    unsafe: true,
    pure_getters: true,
    passes: 3,
  },
  format: {
    comments: false,
  },
};

export default [{
  input: "Cargo.toml",
  output: {
    dir: "target",
  },
  plugins: [
    rust({
      debug: !production,
      verbose: !production,
      watchPatterns: ["Cargo.toml", "src/**/*.rs"],
    }),
    copy({
      targets: [{
        src: "target/wasm-pack/processor/index_bg.wasm",
        dest: dir,
        rename: "processor.wasm"
      }],
    }),
  ],
}, {
  input: "src/main.ts",
  output,
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs(),
    serve({ contentBase: dir, port: 3000, open: true }),
    terser(terser_options),
    scss({
      output: css => styles.push(css),
      outputStyle: production ? "compressed" : "expanded",
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
    livereload(dir),
  ],
  watch: { clearScreen: false },
}, {
  input: "src/worklet.ts",
  output,
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs(),
    terser(terser_options),
    sourcemaps(),
  ],
  watch: { clearScreen: false },
}];
