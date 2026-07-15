(function () {
  "use strict";

  // ---- Topbar: signed-in user + sign out (real data from the auth gate) ----
  function initUserBar() {
    var box = document.getElementById('topbarUser');
    var welcome = document.getElementById('welcomeMsg');
    if (!box) return;
    var session = null;
    try { session = JSON.parse(localStorage.getItem('skydo_auth_session_v1')); } catch (e) {}

    if (session && session.email) {
      var name = session.email.split('@')[0].replace(/[._]/g, ' ');
      name = name.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      if (welcome) welcome.textContent = 'Welcome back, ' + name;
      box.innerHTML = '<span>' + session.email + '</span><span class="signout" id="signOutBtn">Sign out</span>';
      var btn = document.getElementById('signOutBtn');
      if (btn) btn.addEventListener('click', function () {
        localStorage.removeItem('skydo_auth_session_v1');
        location.reload();
      });
    } else {
      box.style.display = 'none';
    }
  }

  // ---- Topbar search: hands off to the Playbook's own search ----
  function initSearch() {
    var form = document.getElementById('globalSearch');
    var input = document.getElementById('globalSearchInput');
    if (!form || !input) return;
    form.addEventListener('submit', function () {
      var q = input.value.trim();
      if (q) location.href = 'playbook.html?q=' + encodeURIComponent(q);
    });
  }

  // ---- Live stats + widgets, sourced from the same feed Delivery Tracker uses ----
  function initLiveStats() {
    var rowsEl = document.getElementById('statRows');
    var dispatchedEl = document.getElementById('statDispatched');
    var pendingEl = document.getElementById('statPending');
    var recentEl = document.getElementById('recentList');
    var topCampEl = document.getElementById('topCampaignsList');
    if (!rowsEl || typeof TRACKER_API_URL === 'undefined') return;

    if (!TRACKER_API_URL || TRACKER_API_URL.indexOf('PASTE_') !== -1) {
      [rowsEl, dispatchedEl, pendingEl].forEach(function (el) { if (el) el.textContent = 'N/A'; });
      if (recentEl) recentEl.textContent = 'Not set up yet. See assets/tracker-config.js.';
      if (topCampEl) topCampEl.textContent = 'Not set up yet. See assets/tracker-config.js.';
      return;
    }

    var cbName = 'dashCallback_' + Date.now();
    var timeoutId = setTimeout(function () {
      [rowsEl, dispatchedEl, pendingEl].forEach(function (el) { if (el) el.textContent = 'N/A'; });
      if (recentEl) recentEl.textContent = "Unable to load. Please refresh to try again.";
      if (topCampEl) topCampEl.textContent = "Unable to load. Please refresh to try again.";
      delete window[cbName];
    }, 30000);

    window[cbName] = function (data) {
      clearTimeout(timeoutId);
      delete window[cbName];
      if (!Array.isArray(data)) return;
      var rows = data.filter(function (r) { return !r._error; });

      rowsEl.textContent = rows.length;

      var dispatched = rows.filter(function (r) { return r['Tracking ID']; }).length;
      if (dispatchedEl) dispatchedEl.textContent = dispatched;

      var pending = rows.filter(function (r) {
        var s = String(r['Status'] || '').toLowerCase();
        return s.indexOf('deliver') === -1;
      }).length;
      if (pendingEl) pendingEl.textContent = pending;

      // Recent submissions — newest Timestamp first
      if (recentEl) {
        var withTime = rows.filter(function (r) { return r['Timestamp']; })
          .sort(function (a, b) { return String(b['Timestamp']).localeCompare(String(a['Timestamp'])); })
          .slice(0, 3);
        recentEl.innerHTML = withTime.length ? withTime.map(function (r) {
          return '<div style="padding:8px 0; border-bottom:1px solid var(--border)">' +
            '<div style="font-weight:600; color:var(--text)">' + (r['Full Name'] || 'Unnamed') + '</div>' +
            '<div style="font-size:12px; color:var(--text-muted)">' + (r['Campaign'] || '') + ' &middot; ' + (r['Timestamp'] || '') + '</div>' +
          '</div>';
        }).join('') : 'No rows yet.';
      }

      // Top campaigns — by row count
      if (topCampEl) {
        var counts = {};
        rows.forEach(function (r) { var c = r['Campaign'] || 'Unknown'; counts[c] = (counts[c] || 0) + 1; });
        var top = Object.keys(counts).map(function (k) { return { name: k, count: counts[k] }; })
          .sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
        topCampEl.innerHTML = top.length ? top.map(function (t, i) {
          return '<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border)">' +
            '<span>' + (i + 1) + '. ' + t.name + '</span><span style="font-weight:600">' + t.count + '</span>' +
          '</div>';
        }).join('') : 'No rows yet.';
      }
    };

    var script = document.createElement('script');
    script.src = TRACKER_API_URL + (TRACKER_API_URL.indexOf('?') === -1 ? '?' : '&') + 'callback=' + cbName;
    script.onerror = function () {
      clearTimeout(timeoutId);
      [rowsEl, dispatchedEl, pendingEl].forEach(function (el) { if (el) el.textContent = 'N/A'; });
    };
    document.body.appendChild(script);
  }

  initUserBar();
  initSearch();
  initLiveStats();
})();
