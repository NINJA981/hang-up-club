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
})();
