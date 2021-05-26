import typescript from "@rollup/plugin-typescript";
import alias from "@rollup/plugin-alias";
import scss from "rollup-plugin-scss";
import html, { makeHtmlAttributes } from "@rollup/plugin-html";
import copy from "rollup-plugin-copy";
import Prism from "prismjs";
import loadPrismLangs from "prismjs/components/";
import HTMLtoJSX from "htmltojsx";
import jsxTransform from "jsx-transform";
import modify from "rollup-plugin-modify";

import { readFile } from "fs/promises";
import { isAbsolute } from "path";

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

function try_ext(extensions) {
  extensions = (extensions ?? []).filter(v => v);

  return {
    async resolveId(id, importer) {
      if (!id.startsWith("."))
        return null;

      for (const file of extensions.map(ext => `${id}.${ext}`)) {
        const r = await this.resolve(file, importer, { skipSelf: true });
        if (r)
          return r.id;
      }

      return null;
    }
  };
}

loadPrismLangs(["typescript"]);
/** @type {import("rollup").PluginImpl} */
function highlight() {
  const name = "highlight";
  const H2J = new HTMLtoJSX({ createClass: false });

  const define = obj => Object.entries(obj)
    .map(([k, v]) => [k,typeof v==="array"?`"${v[0]}"`:v])
    .reduce((r, [k, v]) => `${r}\nexport const ${k} = ${v};`, "\n");

  const apply = f => obj => Object.fromEntries(f(Object.entries(obj)));
  const mapper = f => apply(a => a.map(([k, v]) => [k, f(v)]));
  const checked = f => v => (typeof v === "string" ? f(v) : v);
  const escape = v => `\n"${v.replace(/"/g,"\\\"").replace(/\n/g, "\\n\" +\n\"")}"`;
  const contain = mapper(checked(escape));

  return {
    name,
    async resolveId(id, importer) {
      const [id_name, file, range] = id.split(":");
      if (id_name !== name)
        return null;

      if (isAbsolute(file))
        return id;

      const resolution = await this.resolve(file, importer, { skipSelf: true });
      if (!resolution)
        return;

      return [name, resolution.id, range].join(":");
    },
    async load(id) {
      const [id_name, file, range] = id.split(":");
      if (id_name !== name || !isAbsolute(file))
        return null;

      let mod = "import { h } from \"preact\"";
      mod += define(contain({ file }));

      const [start, end] = JSON.parse(`[${range || 1}]`);
      mod += define({ start, end });

      const code = (await readFile(file, { encoding: "utf-8" }))
        .split("\n")
        .slice(start > 0 ? (start - 1) : start, end)
        .join("\n");
      mod += define(contain({ code }));

      const indents = [...("\n" + code).matchAll(/\n +/g)];
      const common = indents.reduce((m, i) => Math.min(m, i[0].length), 1/0);
      const normalized = ("\n" + code)
        .replace(new RegExp("\n" + " ".repeat(common - 1), "g"), "\n")
        .slice(1);
      mod += define(contain({ normalized }));

      const html = Prism.highlight(normalized, Prism.languages.typescript, "typescript");
      mod += define(contain({ html }));

      const jsx = H2J.convert(`<pre><code>${html}</code></pre>`);
      const fnx = `p => <pre {...p}><code {...p}>${jsx.slice(11)};`;
      const component = jsxTransform.fromString(fnx, { factory: "h" });
      mod += define({ component });

      return mod + "\n\nexport default component;";
    },
  };
}

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

const modify_options = {
  find: /\\u[0-9a-f]{4}/gi,
  replace: s => String.fromCharCode(parseInt(s.slice(2), 16)),
  sourcemap: !production,
};

const replacement = `./node_modules/$&/${production ? "dist/$1.m" : "src/index."}js`;

export default [{
  input: "src/main.ts",
  output,
  plugins: [
    try_ext(["scss"]),
    highlight(),
    typescript(),
    alias({
      entries: [{ find: /^(?:preact\/)?(preact|hooks)$/, replacement }],
    }),
    serve({ contentBase: dir, port: 3000, open: true }),
    terser(terser_options),
    scss({
      output: css => styles.push(css),
      outputStyle: production ? "compressed" : "expanded",
    }),
    modify(modify_options),
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
      }, {
        src: "node_modules/@openfonts/fira-mono_latin/files/fira-mono-latin-400.woff",
        dest: `${dir}/`
      }],
      copyOnce: true,
    }),
    livereload({ dir }),
  ],
  watch: { clearScreen: false },
}, {
  input: "src/worklet.ts",
  output,
  plugins: [
    typescript(),
    terser(terser_options),
    modify(modify_options),
    sourcemaps(),
  ],
  watch: { clearScreen: false },
}];
