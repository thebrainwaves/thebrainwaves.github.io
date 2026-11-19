/* views (js/router.js): pick the view before first paint so deep links never flash the map */
(function (d) {
  d.classList.add('js');
  var h = location.hash.slice(1),
    V = ['about', 'visuals', 'sound', 'artist', 'live', 'lab', 'work', 'plugins', 'contact'],
    A = { lighting: 'live', direction: 'about', mosh: 'plugins', track: 'artist', 'music-video': 'artist' };
  d.setAttribute('data-view', V.indexOf(h) > -1 ? h : (A[h] || 'home'));
})(document.documentElement);
