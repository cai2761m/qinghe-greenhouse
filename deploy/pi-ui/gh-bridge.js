/* 青禾数字大棚 · 本地桥接（由 :8090 同源提供）
 *
 * 作用：把现有页面接到本机真数据上，统一现场监控与设备卡片的视觉。
 *  1. 每 2s 轮询 GET /status，写入 window.__GH__；
 *  2. __GH_FEED__ 被注入进页面的 Ve()（原 Math.random 造数处），把真值喂给 Vue 的响应式 ref；
 *  3. __GH_SWITCH__ / __GH_AUTO__ 挂钩页面设备开关 → POST /actuator；
 *  4. 注入「实景监控」卡片：/snapshot 画面 + 加热棒/旋转控制 + 实机状态；
 *  5. 修正页面里写死的假文案（NaN → —、已稳定运行时长、无硬件设备标注）。
 */
(function () {
  "use strict";
  var API = "";                     // 同源：页面本身就由 :8090 提供
  var POLL_MS = 2000;
  var CAM_MS = 5000;                // /snapshot 单张约 1.1s，5s 一帧足够
  var DEV_MAP = { fan: "fan0", water: "fan1" };   // 页面设备 key → 板上执行器
  var NO_HW = { light: 1, shade: 1 };             // 页面有、板上没有的通道

  window.__GH__ = { ts: Math.floor(Date.now() / 1000) };
  window.__GH_ALLOW_AUTO = true;    // 自动模式是否真的驱动板上执行器（仅风机/水泵）

  /* ---------- 供注入代码调用的取值器 ---------- */
  window.GHn = function (k, d) {
    var g = window.__GH__ || {};
    if (k in g) return g[k];        // 显式给了 NaN 也照给（界面显示 —）
    return d;
  };
  function fin(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }

  window.__GH_FEED__ = function ($, Q, X, W, J, R, ne, U, j) {
    var g = window.__GH__ || {};
    var n = function (k, d) { return (k in g) ? g[k] : d; };
    $.value = +n("room_c", 26.4).toFixed(1);          // 空气温度 ← B 通道（室内那颗）
    Q.value = +n("hum", 68.2).toFixed(1);
    X.value = Math.round(n("lux", 12860));
    W.value = Math.round(n("co2", 426));
    J.value = +n("soil", 65.8).toFixed(1);
    R.value = +n("cpu_c", 42.8).toFixed(1);           // Pi CPU 温度（真实）
    ne.value = Math.round(n("cpu_pct", 23));          // Pi CPU 使用率（真实）
    U.value = g.ts ? new Date(g.ts * 1000) : new Date();
    j.value = j.value.concat([$.value]).slice(-16);   // 趋势序列喂真实温度
  };

  /* ---------- 设备指令下发 ---------- */
  function post(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  var lastDev = {};                 // 去抖：只在状态变化时下发
  function driveDevices(states) {
    Object.keys(DEV_MAP).forEach(function (k) {
      var want = !!states[k];
      if (lastDev[k] === want) return;
      lastDev[k] = want;
      post("/actuator", { device: DEV_MAP[k], value: want ? 255 : 0 });
    });
  }
  window.__GH_SWITCH__ = function (key, on) {
    msg(key + (on ? " 开" : " 关") + (DEV_MAP[key] ? " → " + DEV_MAP[key] + " 下发中" : "（板上无此通道，仅界面记录）"));
    if (DEV_MAP[key]) driveDevices(DEV_MAP[key] === "fan0" ? { fan: on } : { water: on });
  };
  window.__GH_AUTO__ = function (ce) {
    if (!window.__GH_ALLOW_AUTO) return;
    driveDevices(ce);
  };

  /* ---------- 轮询状态 ---------- */
  var errs = 0;
  function poll() {
    fetch(API + "/status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      errs = 0;
      var t = d.temps || {}, h = d.host || {}, ht = d.heater || {}, rot = (d.demo || {}).rotate || {};
      window.__GH__ = {
        room_c: fin(t.t2_c), rod_c: fin(t.t1_c),      // B=室内 / T=贴棒
        hum: NaN, lux: NaN, co2: NaN, soil: NaN,      // 板上未接这三类传感器
        cpu_c: fin(h.cpu_temp_c), cpu_pct: fin(h.cpu_pct), mem_pct: fin(h.mem_pct),
        mem_used_mb: fin(h.mem_used_mb), mem_total_mb: fin(h.mem_total_mb),
        uptime_txt: h.uptime_txt || null, ip: h.ip || null,
        conn: d.connection, machine: d.machine, firmware: d.firmware,
        caps: d.caps ? Object.keys(d.caps).length : 0,
        heater: ht, rotate: rot, act: d.actuators || {},
        ts: Math.floor(Date.now() / 1000)
      };
      paint();
    }).catch(function () { errs++; paint(); });
  }

  /* ---------- 面板绘制 ---------- */
  var panel, cam, kv, log, camState, camTime;
  var metricNodes = {};
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function msg(s) { if (log) { log.textContent = s; } }

  function icon(name) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var paths = {
      camera: "M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
      temperature: "M9 14.8V5a3 3 0 0 1 6 0v9.8a5 5 0 1 1-6 0 M12 9v8",
      room: "M3 10l9-7 9 7 M5 9v12h14V9 M9 21v-7h6v7",
      heat: "M8 3c-3 4 3 5 0 9 M16 3c-3 4 3 5 0 9 M4 16h16 M4 20h16",
      chip: "M7 7h10v10H7z M9 1v4 M15 1v4 M9 19v4 M15 19v4 M1 9h4 M1 15h4 M19 9h4 M19 15h4",
      rotate: "M3 10a9 9 0 0 1 16-4l2 3 M21 3v6h-6 M21 14A9 9 0 0 1 5 20l-2-3 M3 23v-6h6",
      download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5"
    };
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[name] || paths.chip);
    svg.appendChild(path);
    return svg;
  }

  function metric(key, label, symbol, extra) {
    var box = el("div", "gh-metric " + (extra || ""));
    var title = el("span", "gh-metric-label");
    title.appendChild(icon(symbol));
    title.appendChild(document.createTextNode(label));
    var value = el("strong", "gh-metric-value number", "—");
    var unit = el("span", "gh-unit", "°C");
    var reading = el("div", "gh-reading");
    reading.appendChild(value); reading.appendChild(unit);
    var note = el("small", "gh-metric-note", "等待读数");
    box.appendChild(title); box.appendChild(reading); box.appendChild(note);
    metricNodes[key] = { value: value, note: note };
    return box;
  }

  function statusItem(key, label) {
    var item = el("div", "gh-status-item");
    item.appendChild(el("span", null, label));
    var value = el("strong", null, "—");
    item.appendChild(value);
    metricNodes[key] = { value: value };
    return item;
  }

  function build() {
    var grid = document.querySelector(".overview-grid");
    if (!grid) return;
    if (!panel) {
      panel = el("section", "card gh-live-panel");
      panel.id = "gh-panel";
      panel.setAttribute("aria-label", "现场监控与实机数据");
      var head = el("div", "card-heading gh-panel-heading");
      var h2 = el("h2");
      var headIcon = el("span", "gh-heading-icon"); headIcon.appendChild(icon("camera"));
      h2.appendChild(headIcon);
      h2.appendChild(document.createTextNode("生长现场"));
      var titleWrap = el("div", "gh-panel-title");
      titleWrap.appendChild(h2);
      titleWrap.appendChild(el("span", "gh-panel-subtitle", "LIVE MONITORING"));
      head.appendChild(titleWrap);
      var badge = el("span", "badge gh-connection"); badge.id = "gh-badge";
      badge.appendChild(el("span", "tiny-dot")); badge.appendChild(document.createTextNode("连接中"));
      head.appendChild(badge);
      panel.appendChild(head);

      cam = el("img"); cam.id = "gh-cam"; cam.alt = "青禾大棚现场摄像头画面";
      var camWrap = el("div", "gh-cam-wrap");
      camState = el("div", "gh-camera-state", "正在连接现场摄像头…");
      camWrap.appendChild(camState);
      camWrap.appendChild(cam);
      var camTop = el("div", "gh-camera-top");
      var live = el("span", "gh-camera-live");
      live.appendChild(el("i")); live.appendChild(document.createTextNode("LIVE"));
      camTop.appendChild(live); camTop.appendChild(el("span", "gh-camera-id", "CAM 01"));
      camWrap.appendChild(camTop);
      var camBottom = el("div", "gh-camera-bottom");
      camBottom.appendChild(el("span", null, "01 / 现场实景"));
      camTime = el("time", "number", "等待画面");
      camBottom.appendChild(camTime); camWrap.appendChild(camBottom);
      cam.onload = function () {
        cam.classList.add("gh-loaded"); camState.hidden = true;
        camWrap.classList.remove("gh-camera-unavailable");
        camTime.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
      };
      cam.onerror = function () {
        camState.textContent = "摄像头暂未就绪 · 正在重试"; camState.hidden = false;
        camWrap.classList.add("gh-camera-unavailable");
        camTime.textContent = "画面连接中";
      };

      var side = el("div", "gh-side");
      var sectionLabel = el("div", "gh-section-label");
      sectionLabel.appendChild(el("span", null, "现场环境"));
      sectionLabel.appendChild(el("small", null, "实机采集 · 2 秒更新"));
      side.appendChild(sectionLabel);
      kv = el("div", "gh-metrics"); kv.id = "gh-kv";
      kv.appendChild(metric("room", "室内温度", "room", "gh-metric-primary"));
      kv.appendChild(metric("rod", "棒体温度", "temperature"));
      kv.appendChild(metric("target", "加热目标", "heat"));
      side.appendChild(kv);

      var statuses = el("div", "gh-status-list");
      statuses.appendChild(statusItem("fan", "循环风机"));
      statuses.appendChild(statusItem("water", "滴灌水泵"));
      statuses.appendChild(statusItem("rotate", "旋转平台"));
      side.appendChild(statuses);

      var ctl = el("div", "gh-control-bar");
      var lbl = el("label", "gh-temperature-input", "目标温度");
      var inp = el("input"); inp.id = "gh-heat-in"; inp.type = "number";
      inp.min = "0"; inp.max = "35"; inp.step = "0.5"; inp.value = "0";
      inp.setAttribute("aria-label", "加热目标温度，0 至 35 摄氏度");
      lbl.appendChild(inp); lbl.appendChild(el("span", null, "°C"));
      ctl.appendChild(lbl);
      var bon = el("button", "gh-btn gh-btn-primary", "启动加热"); bon.id = "gh-heat-on";
      var boff = el("button", "gh-btn", "关闭加热"); boff.id = "gh-heat-off";
      var brot = el("button", "gh-btn gh-rotate-button", "开启旋转"); brot.id = "gh-rot";
      [bon, boff, brot].forEach(function (b) { ctl.appendChild(b); });
      side.appendChild(ctl);

      var flex = el("div", "gh-flex");
      flex.appendChild(camWrap);
      flex.appendChild(side);
      panel.appendChild(flex);

      var foot = el("div", "gh-panel-footer");
      var hostState = el("span", "gh-host-state");
      hostState.appendChild(icon("chip"));
      metricNodes.host = { value: el("span", null, "Raspberry Pi 5 · 正在获取运行状态") };
      hostState.appendChild(metricNodes.host.value);
      foot.appendChild(hostState);
      var bshot = el("button", "gh-snapshot-button");
      bshot.appendChild(icon("download")); bshot.appendChild(document.createTextNode("保存现场画面"));
      foot.appendChild(bshot); panel.appendChild(foot);
      log = el("div", "gh-feedback"); log.id = "gh-log";
      log.setAttribute("role", "status"); log.setAttribute("aria-live", "polite");
      panel.appendChild(log);

      bon.onclick = function () {
        var v = Number(inp.value);
        if (inp.value === "" || !Number.isFinite(v) || v < 0 || v > 35) {
          msg("请输入 0–35°C 范围内的目标温度"); inp.focus(); return;
        }
        msg("下发 M104 S" + v + " …");
        post("/heater", { target_c: v }).then(function (r) {
          msg(r.ok ? ("加热已设 " + v + "°C") : ("拒绝：" + (r.error || "")));
        }).catch(function (e) { msg("失败 " + e); });
      };
      boff.onclick = function () {
        msg("下发 M104 S0 …");
        post("/heater", { target_c: 0 }).then(function (r) { msg(r.ok ? "加热已关闭" : ("拒绝：" + (r.error || ""))); });
      };
      var lastRot = 0, rotArm = 0;
      brot.onclick = function () {
        var active = !!((window.__GH__.rotate || {}).active);
        if (active && Date.now() - rotArm > 5000) {
          // 停转要「两下」：单次误触只进入待确认，不会真停（演示默认就该一直转）
          rotArm = Date.now();
          brot.textContent = "确认暂停？";
          msg("旋转中 —— 5 秒内再点一次才真的暂停（防误触）");
          setTimeout(function () { if (document.getElementById("gh-rot") === brot) brot.textContent = "暂停旋转"; }, 5000);
          return;
        }
        if (Date.now() - lastRot < 3000) { msg("忽略重复点击（3 秒内）"); return; }
        lastRot = Date.now(); rotArm = 0;
        msg("读取实际状态…");
        fetch(API + "/status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          var on = !((d.demo || {}).rotate || {}).active;      // 以板上真实状态为准，不用本地缓存
          return post("/rotate", { enabled: on }).then(function () { msg(on ? "旋转演示已开" : "旋转已暂停（2 分钟后自动恢复）"); });
        }).catch(function (e) { msg("旋转控制失败 " + e); });
      };
      bshot.onclick = function () {
        var link = document.createElement("a");
        link.href = API + "/snapshot?w=1296&h=972&t=" + Date.now();
        link.download = "青禾-现场画面-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
        document.body.appendChild(link); link.click(); link.remove();
        msg("正在保存现场画面");
      };
      camLoop();
    }
    if (!panel.isConnected) grid.insertBefore(panel, grid.firstChild);
  }

  function camLoop() {
    if (!cam) return;
    cam.src = API + "/snapshot?w=640&h=480&t=" + Date.now();
    setTimeout(camLoop, CAM_MS);
  }

  function fmt(v, d) { return (typeof v === "number" && isFinite(v)) ? v.toFixed(d == null ? 2 : d) : "—"; }

  function paint() {
    build();
    var g = window.__GH__ || {}, ht = g.heater || {}, rot = g.rotate || {}, act = g.act || {};
    if (!kv) return;
    var fresh = errs < 3 && g.conn === "connected";
    metricNodes.room.value.textContent = fresh ? fmt(g.room_c, 1) : "—";
    metricNodes.rod.value.textContent = fresh ? fmt(g.rod_c, 1) : "—";
    metricNodes.target.value.textContent = fresh ? fmt(ht.target_c, 1) : "—";
    metricNodes.room.note.textContent = fresh && fin(g.room_c) !== null ? "B 通道 · 实时采集" : "等待传感器数据";
    metricNodes.rod.note.textContent = fresh && fin(g.rod_c) !== null ? "T 通道 · 贴棒测温" : "等待传感器数据";
    metricNodes.target.note.textContent = !fresh ? "等待设备连接" : ht.reason ? "保护：" + ht.reason : ht.target_c > 0 ? "温控已启用" : "加热未启用";
    [ ["fan", "fan0"], ["water", "fan1"] ].forEach(function (item) {
      var state = act[item[1]], running = fresh && state && state.value > 0;
      metricNodes[item[0]].value.textContent = fresh && state ? (running ? "运行中" : "已关闭") : "—";
      metricNodes[item[0]].value.className = running ? "gh-on" : "gh-off";
    });
    metricNodes.rotate.value.textContent = !fresh ? "—" : rot.active ? "转动中" : "已暂停";
    metricNodes.rotate.value.className = fresh && rot.active ? "gh-on" : "gh-off";
    metricNodes.rotate.value.title = rot.active ? "已执行 " + (rot.segments || 0) + " 段" : "";
    metricNodes.host.value.textContent = errs >= 3 ? "树莓派连接中断 · 正在重试" :
      "Pi 5 · CPU " + fmt(g.cpu_pct, 0) + "% · " + fmt(g.cpu_c, 1) + "°C · 内存 " + fmt(g.mem_pct, 0) + "%";
    if (!panel) return;
    var badge = document.getElementById("gh-badge");
    if (badge) {
      badge.lastChild.textContent = fresh ? "设备在线" : "连接中断";
      badge.classList.toggle("gh-disconnected", !fresh);
    }
    var brot = document.getElementById("gh-rot");
    if (brot && brot.textContent !== "确认暂停？") brot.textContent = rot.active ? "暂停旋转" : "开启旋转";
    if (log && errs > 2) log.textContent = "上位机无响应（" + errs + "）";
  }

  /* ---------- 修正页面里写死的假文案 ---------- */
  function patchDom() {
    var g = window.__GH__ || {};
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n, kill = [];
    while ((n = walk.nextNode())) {
      var s = (n.nodeValue || "").trim();
      if (s === "NaN") kill.push([n, "—"]);
      else if (/^已稳定运行/.test(s) && g.uptime_txt) kill.push([n, "已稳定运行 " + g.uptime_txt]);
    }
    kill.forEach(function (p) { p[0].nodeValue = p[1]; });
    // 板上不存在的通道，在设备卡上标出来
    ["植物补光灯", "遮阳帘"].forEach(function (name) {
      var cards = document.querySelectorAll(".controls-list > *");
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].textContent.indexOf(name) >= 0 && cards[i].getAttribute("data-gh-nohw") !== "1") {
          cards[i].setAttribute("data-gh-nohw", "1");
          var s = el("small", null, "（板上无此通道）");
          s.style.color = "var(--muted)";
          cards[i].appendChild(s);
        }
      }
    });
  }

  /* 视觉样式独立在 /assets/qinghe-refined.css，保留原构建资源与实机接口。 */

  /* ?scroll=<选择器>：加载后把视口滚到指定元素（大屏轮播/核对用） */
  function maybeScroll() {
    var m = /[?&]scroll=([^&]+)/.exec(location.search);
    if (!m) return;
    var sel = decodeURIComponent(m[1]), tries = 0;
    var t = setInterval(function () {
      var e = document.querySelector(sel);
      if (e) { e.scrollIntoView({ block: "start" }); clearInterval(t); }
      else if (++tries > 40) clearInterval(t);
    }, 250);
  }

  function loop() { patchDom(); paint(); }
  poll();
  maybeScroll();
  setInterval(poll, POLL_MS);
  setInterval(loop, POLL_MS);
  setInterval(patchDom, 1000);
  if (document.readyState !== "loading") { loop(); } else { document.addEventListener("DOMContentLoaded", loop); }
})();
