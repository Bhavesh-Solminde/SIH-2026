// Recursive proxy stub for Node built-ins (path, fs, os, util, tty, etc.)
// Returning {} breaks when code does util.promisify(...) — promisify is not
// a function. A recursive Proxy fixes this: every property access returns
// another callable stub, so any chain like util.promisify(fn)(args) never throws.
const makeStub = () =>
  new Proxy(function () { return makeStub(); }, {
    get:       (_t, _p) => makeStub(),
    apply:     ()       => makeStub(),
    construct: ()       => makeStub(),
  });

module.exports = makeStub();
