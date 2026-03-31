/* ============================================================
   NC Subnet Calculator — VLSM & FLSM
   Complete modern rewrite: vanilla JS
   ============================================================ */

(function () {
  'use strict';

  // ===== SUBNET COLORS =====
  var COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#2563eb', '#7c3aed', '#c026d3'
  ];

  // ===== IP UTILITIES =====
  function parseIP(str) {
    str = str.trim();
    var parts = str.split('.');
    if (parts.length !== 4) return null;
    var octets = [];
    for (var i = 0; i < 4; i++) {
      var n = parseInt(parts[i], 10);
      if (isNaN(n) || n < 0 || n > 255 || parts[i] !== String(n)) return null;
      octets.push(n);
    }
    return octets;
  }

  function ipToInt(octets) {
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  }

  function intToIP(num) {
    return [
      (num >>> 24) & 0xFF,
      (num >>> 16) & 0xFF,
      (num >>> 8) & 0xFF,
      num & 0xFF
    ].join('.');
  }

  function cidrToMask(cidr) {
    if (cidr === 0) return 0;
    return (0xFFFFFFFF << (32 - cidr)) >>> 0;
  }

  function maskToStr(cidr) {
    var m = cidrToMask(cidr);
    return intToIP(m);
  }

  function getNetworkAddress(ipInt, cidr) {
    return (ipInt & cidrToMask(cidr)) >>> 0;
  }

  function getBroadcast(networkInt, cidr) {
    var hostBits = 32 - cidr;
    return (networkInt | ((1 << hostBits) - 1)) >>> 0;
  }

  function getUsableHosts(cidr) {
    if (cidr >= 31) return cidr === 31 ? 2 : 1;
    return Math.pow(2, 32 - cidr) - 2;
  }

  function getTotalAddresses(cidr) {
    return Math.pow(2, 32 - cidr);
  }

  function getIPClass(firstOctet) {
    if (firstOctet < 128) return 'A';
    if (firstOctet < 192) return 'B';
    if (firstOctet < 224) return 'C';
    if (firstOctet < 240) return 'D';
    return 'E';
  }

  function hostsNeededToCIDR(hosts) {
    // Find smallest CIDR that can accommodate the hosts
    for (var bits = 1; bits <= 30; bits++) {
      var usable = Math.pow(2, bits) - 2;
      if (usable >= hosts) return 32 - bits;
    }
    return 1; // /1 if huge
  }

  function isValidCIDR(cidr) {
    return cidr >= 1 && cidr <= 30;
  }

  // ===== VLSM CALCULATION =====
  function calculateVLSM(ipOctets, cidr, hostRequirements) {
    var networkInt = getNetworkAddress(ipToInt(ipOctets), cidr);
    var totalSpace = getTotalAddresses(cidr);
    var steps = [];
    var subnets = [];

    // Sort requirements descending
    var sorted = hostRequirements.map(function (h, i) {
      return { hosts: h, originalIndex: i + 1 };
    });
    sorted.sort(function (a, b) { return b.hosts - a.hosts; });

    steps.push({
      type: 'info',
      html: '<p><strong>VLSM</strong> assigns different subnet sizes to each requirement, starting from the largest.</p>'
    });
    steps.push({
      type: 'info',
      html: '<p>Network: <strong>' + intToIP(networkInt) + '/' + cidr + '</strong> — Total address space: <strong>' + totalSpace + '</strong> addresses</p>'
    });

    steps.push({ type: 'heading', text: 'Sorting Requirements (Largest First)' });
    var sortedDesc = sorted.map(function (s) { return 'Subnet ' + s.originalIndex + ': ' + s.hosts + ' hosts'; });
    steps.push({ type: 'step', substeps: sortedDesc });

    var currentAddr = networkInt;
    var totalUsed = 0;

    for (var i = 0; i < sorted.length; i++) {
      var req = sorted[i];
      var subCIDR = hostsNeededToCIDR(req.hosts);
      var blockSize = getTotalAddresses(subCIDR);
      var usable = getUsableHosts(subCIDR);

      // Align to block boundary
      if (currentAddr % blockSize !== 0) {
        currentAddr = (Math.ceil(currentAddr / blockSize) * blockSize) >>> 0;
      }

      var subNetwork = currentAddr;
      var subBroadcast = getBroadcast(subNetwork, subCIDR);
      var firstUsable = (subNetwork + 1) >>> 0;
      var lastUsable = (subBroadcast - 1) >>> 0;

      // Check if subnet fits within the original network
      var originalBroadcast = getBroadcast(networkInt, cidr);
      if (subBroadcast > originalBroadcast) {
        throw new Error('Not enough address space! Subnet ' + req.originalIndex + ' (' + req.hosts + ' hosts) exceeds the available range.');
      }

      steps.push({ type: 'heading', text: 'Subnet ' + req.originalIndex + ' — ' + req.hosts + ' hosts needed' });
      steps.push({
        type: 'step', substeps: [
          'Need at least ' + req.hosts + ' usable hosts',
          '2<sup>n</sup> - 2 ≥ ' + req.hosts,
          'n = ' + (32 - subCIDR) + ' → 2<sup>' + (32 - subCIDR) + '</sup> - 2 = <strong>' + usable + '</strong> usable hosts',
          'CIDR: <strong>/' + subCIDR + '</strong> — Subnet mask: <strong>' + maskToStr(subCIDR) + '</strong>',
          'Block size: <strong>' + blockSize + '</strong> addresses',
          'Network address: <strong>' + intToIP(subNetwork) + '</strong>',
          'First usable: <strong>' + intToIP(firstUsable) + '</strong>',
          'Last usable: <strong>' + intToIP(lastUsable) + '</strong>',
          'Broadcast: <strong>' + intToIP(subBroadcast) + '</strong>'
        ]
      });

      subnets.push({
        index: req.originalIndex,
        hostsNeeded: req.hosts,
        network: intToIP(subNetwork),
        networkInt: subNetwork,
        firstUsable: intToIP(firstUsable),
        lastUsable: intToIP(lastUsable),
        broadcast: intToIP(subBroadcast),
        broadcastInt: subBroadcast,
        cidr: subCIDR,
        mask: maskToStr(subCIDR),
        usableHosts: usable,
        blockSize: blockSize
      });

      currentAddr = (subBroadcast + 1) >>> 0;
      totalUsed += blockSize;
    }

    // Sort subnets back by original index for display
    subnets.sort(function (a, b) { return a.index - b.index; });

    var remaining = totalSpace - totalUsed;
    steps.push({ type: 'heading', text: 'Summary' });
    steps.push({
      type: 'step', substeps: [
        'Total addresses allocated: <strong>' + totalUsed + '</strong> / ' + totalSpace,
        'Remaining addresses: <strong>' + remaining + '</strong>',
        'Utilization: <strong>' + ((totalUsed / totalSpace) * 100).toFixed(1) + '%</strong>'
      ]
    });

    return {
      subnets: subnets,
      steps: steps,
      networkInt: networkInt,
      totalSpace: totalSpace,
      totalUsed: totalUsed,
      remaining: remaining,
      cidr: cidr
    };
  }

  // ===== FLSM CALCULATION =====
  function calculateFLSM(ipOctets, cidr, numSubnets) {
    var networkInt = getNetworkAddress(ipToInt(ipOctets), cidr);
    var totalSpace = getTotalAddresses(cidr);
    var steps = [];
    var subnets = [];

    // Find bits needed for subnets
    var subnetBits = Math.ceil(Math.log2(numSubnets));
    if (subnetBits < 1) subnetBits = 1;
    var newCIDR = cidr + subnetBits;

    if (newCIDR > 30) {
      throw new Error('Cannot create ' + numSubnets + ' subnets from /' + cidr + '. Maximum subnets: ' + Math.pow(2, 30 - cidr));
    }

    var actualSubnets = Math.pow(2, subnetBits);
    var blockSize = getTotalAddresses(newCIDR);
    var usable = getUsableHosts(newCIDR);

    steps.push({
      type: 'info',
      html: '<p><strong>FLSM</strong> divides the network into equal-sized subnets.</p>'
    });
    steps.push({
      type: 'info',
      html: '<p>Network: <strong>' + intToIP(networkInt) + '/' + cidr + '</strong> — Total address space: <strong>' + totalSpace + '</strong> addresses</p>'
    });

    steps.push({ type: 'heading', text: 'Calculating Subnet Size' });
    steps.push({
      type: 'step', substeps: [
        'Required subnets: ' + numSubnets,
        '2<sup>n</sup> ≥ ' + numSubnets,
        'n = ' + subnetBits + ' → 2<sup>' + subnetBits + '</sup> = <strong>' + actualSubnets + '</strong> subnets',
        'New CIDR: /' + cidr + ' + ' + subnetBits + ' = <strong>/' + newCIDR + '</strong>',
        'Subnet mask: <strong>' + maskToStr(newCIDR) + '</strong>',
        'Block size per subnet: <strong>' + blockSize + '</strong> addresses',
        'Usable hosts per subnet: <strong>' + usable + '</strong>'
      ]
    });

    var currentAddr = networkInt;
    for (var i = 0; i < actualSubnets; i++) {
      var subNetwork = currentAddr;
      var subBroadcast = getBroadcast(subNetwork, newCIDR);
      var firstUsable = (subNetwork + 1) >>> 0;
      var lastUsable = (subBroadcast - 1) >>> 0;

      steps.push({ type: 'heading', text: 'Subnet ' + (i + 1) });
      steps.push({
        type: 'step', substeps: [
          'Network: <strong>' + intToIP(subNetwork) + '/' + newCIDR + '</strong>',
          'First usable: <strong>' + intToIP(firstUsable) + '</strong>',
          'Last usable: <strong>' + intToIP(lastUsable) + '</strong>',
          'Broadcast: <strong>' + intToIP(subBroadcast) + '</strong>'
        ]
      });

      subnets.push({
        index: i + 1,
        hostsNeeded: null,
        network: intToIP(subNetwork),
        networkInt: subNetwork,
        firstUsable: intToIP(firstUsable),
        lastUsable: intToIP(lastUsable),
        broadcast: intToIP(subBroadcast),
        broadcastInt: subBroadcast,
        cidr: newCIDR,
        mask: maskToStr(newCIDR),
        usableHosts: usable,
        blockSize: blockSize
      });

      currentAddr = (subBroadcast + 1) >>> 0;
    }

    var totalUsed = actualSubnets * blockSize;

    steps.push({ type: 'heading', text: 'Summary' });
    steps.push({
      type: 'step', substeps: [
        'Subnets created: <strong>' + actualSubnets + '</strong>',
        'Usable hosts per subnet: <strong>' + usable + '</strong>',
        'Total addresses used: <strong>' + totalUsed + '</strong> / ' + totalSpace,
        'Utilization: <strong>' + ((totalUsed / totalSpace) * 100).toFixed(1) + '%</strong>'
      ]
    });

    return {
      subnets: subnets,
      steps: steps,
      networkInt: networkInt,
      totalSpace: totalSpace,
      totalUsed: totalUsed,
      remaining: totalSpace - totalUsed,
      cidr: cidr,
      newCIDR: newCIDR
    };
  }

  // ===== RENDERING =====
  function renderStepsHTML(steps) {
    var html = '';
    for (var s = 0; s < steps.length; s++) {
      var step = steps[s];
      if (step.type === 'heading') html += '<h3 class="step-heading">' + step.text + '</h3>';
      else if (step.type === 'info') html += step.html;
      else if (step.type === 'step') {
        html += '<div class="step-block">';
        for (var ss = 0; ss < step.substeps.length; ss++) {
          html += '<div class="step-line">' + step.substeps[ss] + '</div>';
        }
        html += '</div>';
      }
    }
    return html;
  }

  function renderSubnetTable(subnets, isVLSM) {
    var html = '<div class="subnet-table-wrap"><table class="subnet-table">';
    html += '<thead><tr>';
    html += '<th>#</th>';
    if (isVLSM) html += '<th>Hosts Needed</th>';
    html += '<th>Network Address</th>';
    html += '<th>First Usable</th>';
    html += '<th>Last Usable</th>';
    html += '<th>Broadcast</th>';
    html += '<th>CIDR</th>';
    html += '<th>Subnet Mask</th>';
    html += '<th>Usable Hosts</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < subnets.length; i++) {
      var s = subnets[i];
      html += '<tr>';
      html += '<td class="subnet-num">' + s.index + '</td>';
      if (isVLSM) html += '<td class="hosts-col">' + s.hostsNeeded + '</td>';
      html += '<td>' + s.network + '</td>';
      html += '<td>' + s.firstUsable + '</td>';
      html += '<td>' + s.lastUsable + '</td>';
      html += '<td>' + s.broadcast + '</td>';
      html += '<td>/' + s.cidr + '</td>';
      html += '<td>' + s.mask + '</td>';
      html += '<td class="hosts-col">' + s.usableHosts + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  function renderSubnetMap(result) {
    // Sort subnets by network address for the map
    var sorted = result.subnets.slice().sort(function (a, b) { return a.networkInt - b.networkInt; });
    var totalSpace = result.totalSpace;

    var html = '<div class="subnet-map">';
    html += '<h3>Address Space Map</h3>';
    html += '<div class="map-container">';

    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i];
      var pct = (s.blockSize / totalSpace * 100);
      var color = COLORS[i % COLORS.length];
      html += '<div class="map-bar" style="background:' + color + ';">';
      html += '<span class="map-bar-label">Subnet ' + s.index + '</span>';
      html += '<span class="map-bar-detail">' + s.network + '/' + s.cidr + '</span>';
      html += '<span class="map-bar-size">' + s.blockSize + ' addr (' + pct.toFixed(1) + '%)</span>';
      html += '</div>';
    }

    if (result.remaining > 0) {
      var remPct = (result.remaining / totalSpace * 100);
      html += '<div class="map-bar map-unused">';
      html += '<span class="map-bar-label">Unused</span>';
      html += '<span class="map-bar-detail">Available for future allocation</span>';
      html += '<span class="map-bar-size">' + result.remaining + ' addr (' + remPct.toFixed(1) + '%)</span>';
      html += '</div>';
    }

    html += '</div>';

    // Legend
    html += '<div class="map-legend">';
    for (var j = 0; j < sorted.length; j++) {
      var color2 = COLORS[j % COLORS.length];
      html += '<div class="legend-item"><span class="legend-swatch" style="background:' + color2 + ';"></span> Subnet ' + sorted[j].index + '</div>';
    }
    if (result.remaining > 0) {
      html += '<div class="legend-item"><span class="legend-swatch" style="background:var(--bg-secondary);border:1px solid var(--border-color);"></span> Unused</div>';
    }
    html += '</div></div>';

    return html;
  }

  // ===== HISTORY =====
  var HISTORY_KEY = 'nc_subnetter_history';

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveHistory(entry) {
    var history = loadHistory();
    history.unshift(entry);
    if (history.length > 50) history.length = 50;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryPanel();
  }

  function renderHistoryPanel() {
    var list = document.getElementById('history-list');
    var history = loadHistory();
    if (history.length === 0) {
      list.innerHTML = '<p class="history-empty">No calculations yet</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      html += '<div class="history-item" data-index="' + i + '">';
      html += '<div class="history-meta">';
      html += '<span class="history-method">' + h.mode.toUpperCase() + '</span>';
      html += '<span class="history-size">/' + h.cidr + '</span>';
      html += '<span class="history-date">' + new Date(h.date).toLocaleDateString() + '</span>';
      html += '</div>';
      html += '<div class="history-preview">' + h.ip + '/' + h.cidr;
      if (h.hosts) html += ' → ' + h.hosts;
      else if (h.numSubnets) html += ' → ' + h.numSubnets + ' subnets';
      html += '</div></div>';
    }
    list.innerHTML = html;

    list.addEventListener('click', function (e) {
      var item = e.target.closest('.history-item');
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-index'));
      if (!isNaN(idx) && history[idx]) {
        loadFromHistory(history[idx]);
        document.getElementById('history-panel').classList.remove('open');
      }
    });
  }

  function loadFromHistory(h) {
    document.getElementById('ip-input').value = h.ip;
    document.getElementById('cidr-input').value = h.cidr;
    document.getElementById('mode-select').value = h.mode;
    toggleMode();
    if (h.mode === 'vlsm') {
      document.getElementById('hosts-input').value = h.hosts || '';
    } else {
      document.getElementById('subnets-input').value = h.numSubnets || '';
    }
  }

  // ===== URL SHARING =====
  function encodeToURL(ip, cidr, mode, hosts, numSubnets) {
    var params = new URLSearchParams();
    params.set('ip', ip);
    params.set('cidr', cidr);
    params.set('mode', mode);
    if (mode === 'vlsm' && hosts) params.set('hosts', hosts);
    if (mode === 'flsm' && numSubnets) params.set('subnets', numSubnets);
    return window.location.origin + window.location.pathname + '?' + params.toString();
  }

  function decodeFromURL() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('ip') || !params.has('cidr')) return null;
    return {
      ip: params.get('ip'),
      cidr: parseInt(params.get('cidr')),
      mode: params.get('mode') || 'vlsm',
      hosts: params.get('hosts') || '',
      numSubnets: params.get('subnets') || ''
    };
  }

  // ===== THEME =====
  function initTheme() {
    var saved = localStorage.getItem('nc_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nc_theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ===== MODE TOGGLE =====
  function toggleMode() {
    var mode = document.getElementById('mode-select').value;
    document.getElementById('vlsm-section').style.display = mode === 'vlsm' ? 'block' : 'none';
    document.getElementById('flsm-section').style.display = mode === 'flsm' ? 'block' : 'none';
  }

  // ===== VALIDATION =====
  function showError(msg) {
    var output = document.getElementById('output');
    output.innerHTML = '<div class="error-message"><strong>Error:</strong> ' + msg + '</div>';
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== EXAMPLES =====
  function loadExample() {
    var mode = document.getElementById('mode-select').value;
    document.getElementById('ip-input').value = '192.168.1.0';
    document.getElementById('cidr-input').value = '24';
    if (mode === 'vlsm') {
      document.getElementById('hosts-input').value = '50, 30, 20, 10';
    } else {
      document.getElementById('subnets-input').value = '4';
    }
  }

  // ===== MAIN CALCULATION =====
  function calculate() {
    // Clear errors
    var errorEls = document.querySelectorAll('.input-error');
    for (var e = 0; e < errorEls.length; e++) errorEls[e].classList.remove('input-error');
    document.getElementById('ip-hint').textContent = '';
    document.getElementById('ip-hint').className = 'input-hint';

    // Parse IP
    var ipStr = document.getElementById('ip-input').value.trim();
    var ipOctets = parseIP(ipStr);
    if (!ipOctets) {
      document.getElementById('ip-input').classList.add('input-error');
      document.getElementById('ip-hint').textContent = 'Enter a valid IPv4 address (e.g., 192.168.1.0)';
      document.getElementById('ip-hint').className = 'input-hint error';
      return;
    }

    // Parse CIDR
    var cidr = parseInt(document.getElementById('cidr-input').value, 10);
    if (isNaN(cidr) || !isValidCIDR(cidr)) {
      document.getElementById('cidr-input').classList.add('input-error');
      document.getElementById('ip-hint').textContent = 'CIDR must be between 1 and 30';
      document.getElementById('ip-hint').className = 'input-hint error';
      return;
    }

    // Show IP class
    var ipClass = getIPClass(ipOctets[0]);
    var networkAddr = intToIP(getNetworkAddress(ipToInt(ipOctets), cidr));
    document.getElementById('ip-hint').innerHTML = 'Class ' + ipClass + ' — Network: ' + networkAddr + '/' + cidr;
    document.getElementById('ip-hint').className = 'input-hint info';

    var mode = document.getElementById('mode-select').value;
    var output = document.getElementById('output');
    var result;

    try {
      if (mode === 'vlsm') {
        var hostsStr = document.getElementById('hosts-input').value.trim();
        if (!hostsStr) {
          document.getElementById('hosts-input').classList.add('input-error');
          showError('Enter host requirements (comma separated)');
          return;
        }
        var hostReqs = hostsStr.split(',').map(function (s) { return parseInt(s.trim(), 10); });
        if (hostReqs.some(isNaN) || hostReqs.some(function (h) { return h < 1; })) {
          document.getElementById('hosts-input').classList.add('input-error');
          showError('All host requirements must be positive integers');
          return;
        }
        result = calculateVLSM(ipOctets, cidr, hostReqs);
      } else {
        var numSubnets = parseInt(document.getElementById('subnets-input').value, 10);
        if (isNaN(numSubnets) || numSubnets < 1) {
          document.getElementById('subnets-input').classList.add('input-error');
          showError('Enter a valid number of subnets (≥ 1)');
          return;
        }
        result = calculateFLSM(ipOctets, cidr, numSubnets);
      }
    } catch (err) {
      showError(err.message);
      return;
    }

    // Build output
    var html = '';

    // Summary panel
    html += '<div class="result-panel">';
    html += '<h2 class="result-title">' + (mode === 'vlsm' ? 'VLSM' : 'FLSM') + ' Results</h2>';
    html += '<div class="result-info"><strong>Network:</strong> ' + networkAddr + '/' + cidr + ' — <strong>Class:</strong> ' + ipClass + ' — <strong>Subnets:</strong> ' + result.subnets.length + '</div>';

    // Subnet Table
    html += '<div class="result-section">';
    html += '<h3>Subnet Table</h3>';
    html += renderSubnetTable(result.subnets, mode === 'vlsm');
    html += '</div>';

    // Visual Map
    html += renderSubnetMap(result);

    // Step by step
    html += '<details class="steps-details"><summary>Step-by-Step Calculation</summary>';
    html += '<div class="steps-content">' + renderStepsHTML(result.steps) + '</div>';
    html += '</details>';

    html += '</div>';

    // Share
    var hostsParam = mode === 'vlsm' ? document.getElementById('hosts-input').value.trim() : '';
    var subnetsParam = mode === 'flsm' ? document.getElementById('subnets-input').value.trim() : '';
    var shareURL = encodeToURL(ipStr, cidr, mode, hostsParam, subnetsParam);
    html += '<div class="share-section">';
    html += '<button class="btn btn-small btn-share" id="share-btn">Share Link</button>';
    html += '<button class="btn btn-small" id="print-btn">🖨 Print</button>';
    html += '<input type="text" class="share-url" id="share-url" value="' + escapeHTML(shareURL) + '" readonly>';
    html += '</div>';

    output.innerHTML = html;

    // Share handler
    document.getElementById('share-btn').addEventListener('click', function () {
      var urlInput = document.getElementById('share-url');
      navigator.clipboard.writeText(urlInput.value).then(function () {
        var btn = document.getElementById('share-btn');
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Share Link'; }, 1500);
      }).catch(function () {
        document.getElementById('share-url').select();
      });
    });

    document.getElementById('print-btn').addEventListener('click', function () {
      window.print();
    });

    // Save to history
    saveHistory({
      date: Date.now(),
      ip: ipStr,
      cidr: cidr,
      mode: mode,
      hosts: mode === 'vlsm' ? hostsParam : null,
      numSubnets: mode === 'flsm' ? subnetsParam : null
    });
    renderHistoryPanel();
  }

  // ===== INITIALIZATION =====
  function init() {
    initTheme();

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('mode-select').addEventListener('change', toggleMode);
    document.getElementById('calculate-btn').addEventListener('click', calculate);
    document.getElementById('example-btn').addEventListener('click', function () {
      loadExample();
      calculate();
    });

    document.getElementById('clear-btn').addEventListener('click', function () {
      document.getElementById('output').innerHTML = '';
      document.getElementById('ip-input').value = '';
      document.getElementById('cidr-input').value = '';
      document.getElementById('hosts-input').value = '';
      document.getElementById('subnets-input').value = '';
      document.getElementById('ip-hint').textContent = '';
      document.getElementById('ip-hint').className = 'input-hint';
      var errorEls = document.querySelectorAll('.input-error');
      for (var i = 0; i < errorEls.length; i++) errorEls[i].classList.remove('input-error');
    });

    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);

    document.getElementById('history-toggle-btn').addEventListener('click', function () {
      document.getElementById('history-panel').classList.toggle('open');
    });

    renderHistoryPanel();

    // Load from URL
    var urlData = decodeFromURL();
    if (urlData) {
      document.getElementById('ip-input').value = urlData.ip;
      document.getElementById('cidr-input').value = urlData.cidr;
      document.getElementById('mode-select').value = urlData.mode;
      toggleMode();
      if (urlData.mode === 'vlsm') {
        document.getElementById('hosts-input').value = urlData.hosts;
      } else {
        document.getElementById('subnets-input').value = urlData.numSubnets;
      }
      setTimeout(calculate, 100);
    }

    // Keyboard shortcut
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) calculate();
    });

    // IP input validation on blur
    document.getElementById('ip-input').addEventListener('blur', function () {
      var val = this.value.trim();
      if (val && !parseIP(val)) {
        this.classList.add('input-error');
        document.getElementById('ip-hint').textContent = 'Invalid IPv4 address';
        document.getElementById('ip-hint').className = 'input-hint error';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
