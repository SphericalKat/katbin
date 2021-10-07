const fs = require("fs-extra");
const esbuild = require("esbuild");
const { default: postCSSPlugin } = require("esbuild-plugin-postcss2");

// PostCSS Plugins
const autoprefixer = require("autoprefixer");
const tailwindcss = require("tailwindcss");
const postcssImport = require("postcss-import");

const productionBuild = process.env.NODE_ENV === "production";
fs.copySync("static/", "../priv/static/");

console.log("[build.js] [info] Copying static files from static/");

if (!productionBuild) {
  console.log("[build.js] [info] Starting to watch assets for changes");
} else {
  console.log("[build.js] [info] Building assets in production mode");
}

esbuild
  .build({
    entryPoints: ["js/app.js"],
    bundle: true,
    outfile: "../priv/static/assets/app.js",
    minify: productionBuild,
    watch: !productionBuild,
    external: ["*.ttf"],
    plugins: [
      postCSSPlugin({
        plugins: [postcssImport, tailwindcss, autoprefixer],
      }),
    ],
  })
  .catch((e) => {
    console.error(`[build.js] [error] ${e}`);
    process.exit(1);
  });
