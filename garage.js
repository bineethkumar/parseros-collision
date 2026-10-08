/* Parceros Collision Center: drive-through garage interactions (vanilla, no deps) */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function init() {
    var root = document.querySelector(".g-site");
    if (!root || root.getAttribute("data-ready")) return;
    root.setAttribute("data-ready", "1");

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var narrow = window.matchMedia("(max-width: 860px)");

    /* ---------- film scrub ---------- */
    var intro = root.querySelector(".g-intro");
    var video = root.querySelector(".g-film");
    var lines = Array.prototype.slice.call(root.querySelectorAll(".g-line"));
    var gauge = root.querySelector(".g-intro__gauge");
    var seekPending = false, targetTime = 0;

    if (video && !reduce) {
      var src = narrow.matches ? video.getAttribute("data-src-mobile") : video.getAttribute("data-src");
      video.src = src;
      video.load();
      var prime = function () {
        var p = video.play();
        if (p && p.then) p.then(function () { video.pause(); }).catch(function () {});
        window.removeEventListener("touchstart", prime);
      };
      window.addEventListener("touchstart", prime, { passive: true });
      video.addEventListener("loadedmetadata", function () { update(); });
    }

    function seek() {
      seekPending = false;
      if (!video || !video.duration || video.readyState < 1) return;
      if (Math.abs(video.currentTime - targetTime) > 0.02) {
        try { video.currentTime = targetTime; } catch (e) {}
      }
    }
    if (video) video.addEventListener("seeked", function () { if (Math.abs(video.currentTime - targetTime) > 0.04) seek(); });

    /* ---------- bays ---------- */
    var bays = root.querySelector(".g-bays");
    var track = root.querySelector(".g-track");
    var shutter = root.querySelector(".g-shutter");
    var road = root.querySelector(".g-road");
    var bayEls = Array.prototype.slice.call(root.querySelectorAll(".g-bay"));
    var links = Array.prototype.slice.call(root.querySelectorAll("[data-bay-link]"));
    var N = bayEls.length;
    var SHUTTER = 0.7; // viewport heights spent rolling the shutter up
    var activeBay = -1;

    function drives() { return !reduce && !narrow.matches; }

    function bayScrollY(i) {
      var top = bays.getBoundingClientRect().top + window.scrollY;
      if (!drives()) return bayEls[i].getBoundingClientRect().top + window.scrollY - 70;
      var vh = window.innerHeight;
      return top + SHUTTER * vh + i * vh + 2;
    }

    function setActive(i) {
      if (i === activeBay) return;
      activeBay = i;
      links.forEach(function (a, k) { a.classList.toggle("is-active", k === i); });
    }

    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight;

      if (intro) {
        var r = intro.getBoundingClientRect();
        var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
        if (gauge) gauge.style.setProperty("--p", p.toFixed(4));
        lines.forEach(function (el) {
          var on = p >= parseFloat(el.getAttribute("data-from")) && p < parseFloat(el.getAttribute("data-to"));
          if (on) el.setAttribute("data-on", ""); else el.removeAttribute("data-on");
        });
        if (video && video.duration && !reduce) {
          targetTime = p * (video.duration - 0.05);
          if (!seekPending) { seekPending = true; requestAnimationFrame(seek); }
        }
      }

      if (bays && drives()) {
        var b = bays.getBoundingClientRect();
        var scrolled = clamp(-b.top, 0, b.height - vh);
        var s = clamp(scrolled / (SHUTTER * vh), 0, 1);
        var raw = clamp((scrolled - SHUTTER * vh) / vh, 0, N - 1);
        var seg = Math.min(N - 2, Math.floor(raw)), f = raw - seg;
        var e = f < 0.22 ? 0 : f > 0.78 ? 1 : (function (x) { return x * x * (3 - 2 * x); })((f - 0.22) / 0.56);
        var travel = (seg + e) / (N - 1); // each bay holds still for a moment before the drive to the next
        if (shutter) shutter.style.setProperty("--s", s.toFixed(4));
        track.style.transform = "translate3d(" + (-travel * (N - 1) * window.innerWidth).toFixed(1) + "px,0,0)";
        if (road) road.style.setProperty("--r", travel.toFixed(4));
        setActive(b.top < vh * 0.5 && b.bottom > vh * 0.5 && s >= 1 ? Math.round(travel * (N - 1)) : -1);
      } else if (bays) {
        var found = -1;
        bayEls.forEach(function (el, k) { var rr = el.getBoundingClientRect(); if (rr.top < vh * 0.5 && rr.bottom > vh * 0.5) found = k; });
        setActive(found);
      }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (narrow.addEventListener) narrow.addEventListener("change", function () { if (track) track.style.transform = ""; onScroll(); });

    /* nav jump links land on the right bay even while the page drives sideways */
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: bayScrollY(parseInt(a.getAttribute("data-bay-link"), 10)), behavior: reduce ? "auto" : "smooth" });
      });
    });
    var tour = root.querySelector(".g-cta-tour");
    if (tour) tour.addEventListener("click", function (e) {
      if (!drives()) return;
      e.preventDefault();
      window.scrollTo({ top: bayScrollY(0), behavior: reduce ? "auto" : "smooth" });
    });

    /* clipboard ticks itself as you read it */
    var ticks = Array.prototype.slice.call(root.querySelectorAll(".g-ticks li"));
    if ("IntersectionObserver" in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          ticks.forEach(function (li, k) { setTimeout(function () { li.classList.add("is-ticked"); }, 250 * k); });
          io.disconnect();
        });
      }, { threshold: 0.4 });
      var board = root.querySelector(".g-clipboard");
      if (board) io.observe(board);
    } else {
      ticks.forEach(function (li) { li.classList.add("is-ticked"); });
    }

    var yr = root.querySelector("[data-year]");
    if (yr) yr.textContent = String(new Date().getFullYear());

    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("load", init);
})();
