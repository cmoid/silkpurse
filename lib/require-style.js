// Replacement for the require-style package. That package guesses a basedir
// from the calling file via caller-path, which in Electron >= 12 returns a
// file:// URL for callsites originating in an HTML page; resolve() then
// treats it as a relative path and breaks inside the packaged app.asar.
// Resolving against the app root avoids the guessing entirely.
const { readFileSync } = require("fs");
const { join, dirname } = require("path");
const styleResolve = require("style-resolve");

const cssUrlRegex = /url\((["'])?(.*?)\1\)/gi;
const dotSlashRegex = /^[./]*/;

module.exports = function requireStyle(name) {
  const path = styleResolve.sync(name, {
    basedir: join(__dirname, ".."),
  });
  let css = readFileSync(path, "utf8");

  // resolve any relative paths to absolute paths
  css = css.replace(cssUrlRegex, (_, _2, url) => {
    url = url.replace(dotSlashRegex, (match) => join(dirname(path), match));
    return `url('${url}')`;
  });
  return css;
};
