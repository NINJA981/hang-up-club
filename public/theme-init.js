// Pre-paint theme resolution (SPEC §10.1: the theme is the only value mirrored
// to localStorage, so the first frame is painted in the right theme). Loaded
// as a blocking same-origin script because the CSP forbids inline scripts.
(function () {
  var pref = 'system';
  try {
    var stored = window.localStorage.getItem('huc-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') pref = stored;
  } catch (e) {
    /* storage blocked: follow the system */
  }
  var dark =
    pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  // An in-app choice that differs from the OS must also win in the status bar: keep only the matching
  // theme-color meta live (the same rule as syncThemeColor in src/app/theme.ts).
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) {
    var m = metas[i];
    var original = m.getAttribute('media') || '';
    m.setAttribute('data-media', original);
    var scheme = original.indexOf('dark') >= 0 ? 'dark' : 'light';
    if (pref !== 'system') m.setAttribute('media', pref === scheme ? 'all' : 'not all');
  }
})();
