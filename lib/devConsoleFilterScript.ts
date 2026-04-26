/**
 * IIFE for next/script (beforeInteractive, development only).
 * Silences common third-party / dev noise: wallet SES / lockdown, React DevTools nudge.
 * If a message is suppressed, the filter calls are chained so the original methods stay intact for restore.
 * Note: Firefox "Deprecation" lines emitted by the engine (not through console) cannot be silenced in JS.
 */
export const devConsoleFilterInline = `(function() {
  if (typeof window === "undefined" || !console) return;
  var patterns = [
    /SES |lockdown-install|unpermitted intrinsics|Removing intrinsics\\.?|getOrInsert/,
    /Download the React DevTools/i,
    /MouseEvent\\.moz(Pressure|InputSource)|Use PointerEvent\\./
  ];
  function hit(a) {
    return patterns.some(function(p) {
      return p.test(a);
    });
  }
  var origL = console.log, origI = console.info, origW = console.warn, origD = console.debug;
  function join(a) {
    if (!a || !a.length) return "";
    for (var i = 0, s = ""; i < a.length; i++) s += (i ? " " : "") + (typeof a[i] === "string" ? a[i] : (a[i] && a[i].toString) ? a[i].toString() : String(a[i]));
    return s;
  }
  console.log = function() { var j = join(arguments); if (!hit(j)) return origL.apply(console, arguments); };
  console.info = function() { var j = join(arguments); if (!hit(j)) return origI.apply(console, arguments); };
  console.warn = function() { var j = join(arguments); if (!hit(j)) return origW.apply(console, arguments); };
  console.debug = function() { var j = join(arguments); if (!hit(j)) return origD.apply(console, arguments); };
})();`;
