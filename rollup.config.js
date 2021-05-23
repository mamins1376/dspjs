import typescript from "@rollup/plugin-typescript";
import alias from "@rollup/plugin-alias";
import scss from "rollup-plugin-scss";
import html, { makeHtmlAttributes } from "@rollup/plugin-html";
import copy from "rollup-plugin-copy";
import modify from "rollup-plugin-modify";

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

const styles = [];

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
    .splice(0)
    .map(style => `<style>\n${style}\n    </style>`)
    .join("\n    ");

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

const replacement = `./node_modules/$&/${production ? "dist/$1.m" : "src/index."}js`;

export default {
  input: "src/main.ts",
  output: {
    dir,
    sourcemap: !production,
    format: "iife",
  },
  plugins: [
    typescript(),
    alias({
      entries: [{ find: /^(?:preact\/)?(preact|hooks)$/, replacement }],
    }),
    serve({ contentBase: dir, port: 3000, open: true }),
    terser({
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
    }),
    scss({
      output: css => styles.push(css),
      outputStyle: production ? "compressed" : "expanded",
    }),
    modify({
      find: /\\u[0-9a-f]{4}/gi,
      replace: s => String.fromCharCode(parseInt(s.slice(2), 16)),
      sourcemap: !production,
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
    livereload({ dir }),
  ],
  watch: { clearScreen: false },
};
