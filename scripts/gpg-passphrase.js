const { execFileSync } = require("child_process");

function gpgWithPassphrase(args, passphrase, options = {}) {
  if (!passphrase) throw new Error("gpg passphrase required");
  return execFileSync("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", ...args], {
    input: passphrase,
    encoding: options.encoding,
    stdio: options.stdio,
    env: process.env,
    maxBuffer: options.maxBuffer,
  });
}

module.exports = { gpgWithPassphrase };
