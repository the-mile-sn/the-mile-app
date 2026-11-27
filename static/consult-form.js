/* Formulário pré-consulta da The Mile (página oculta em themile.pt, aberta só pelo link). */
(function () {
  "use strict";
  var token = new URLSearchParams(location.search).get("t") || "";
  var app = document.getElementById("tmf-app");
  var shownToasts = {};
  var topInfo = document.getElementById("tmf-top-info");
  var data = null;          // resposta de /dados
  var answers = {};
  var current = 0;          // índice em data.steps (ecrãs)
  var mode = "fill";        // fill | review (depois de enviado)
  var saveTimer = null;
  var errors = {};
  var dailyPending = {};    // alimentos com «Todos» à espera de «quantas vezes por dia»
  var scrollTarget = null;
  var lastRendered = null;  // só anima quando muda de ecrã

  var WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var ADDRESS = "Largo das Hortas 220 N, Guimarães";
  var URINE = ["#fbf6d9", "#f7eeaa", "#f1df74", "#e9cc45", "#d9b22a", "#c4951c", "#a87a14"];
  // Frequência: primeiro os dias por semana; «Todos» abre «quantas vezes por dia» quando há mais do que uma opção.
  var WEEKLY = [["never", "Nunca", ""], ["d1_2", "1–2", "dias"], ["d3_4", "3–4", "dias"], ["d5_6", "5–6", "dias"], ["all", "Todos", "os dias"]];
  var SECONDS_PER_SCREEN = 40;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function api(path, body) {
    var url = "formulario/" + path + "?t=" + encodeURIComponent(token);
    var opts = body ? {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)} : {};
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return {ok: r.ok, status: r.status, body: j}; });
    });
  }
  function niceDate(iso, start) {
    var d = new Date(iso + "T12:00:00");
    return WEEK[d.getDay()] + ", " + d.getDate() + " " + MONTH[d.getMonth()] + (start ? " · " + start : "");
  }
  function matches(answer, value) {
    return Array.isArray(answer) ? answer.indexOf(value) >= 0 : answer === value;
  }
  function same(a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b); }
  function visible(item) {
    var when = item.when || {}, not = item.when_not || {};
    var ok = Object.keys(when).every(function (k) { return matches(answers[k], when[k]); });
    return ok && Object.keys(not).every(function (k) {
      return !not[k].some(function (h) { return same(answers[k], h); });
    });
  }
  function screens() { return data.steps.filter(visible); }
  function groups() {
    var out = [];
    screens().forEach(function (s) { if (out.indexOf(s.group) < 0) out.push(s.group); });
    return out;
  }
  function empty(v) {
    return v == null || v === "" || (Array.isArray(v) && !v.length) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
  }
  function firstName() { return data.first_name ? " " + data.first_name : ""; }
  function prune() {
    // Respostas escondidas (ex.: saúde feminina num homem) não são enviadas.
    var out = {};
    data.steps.forEach(function (s) {
      var sv = visible(s);
      s.fields.forEach(function (f) {
        if (!sv || !visible(f) || empty(answers[f.id]) || errors[f.id] === true) return;
        out[f.id] = answers[f.id];
      });
    });
    return out;
  }

  function setSave(text, bad) {
    var saveEl = document.getElementById("tmf-save");
    if (!saveEl) return;
    saveEl.textContent = text;
    saveEl.classList.toggle("is-error", !!bad);
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    setSave("A guardar…");
    saveTimer = setTimeout(saveNow, 700);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    return api("guardar", {answers: prune(), step: current}).then(function (r) {
      if (r.ok) setSave("Guardado");
      else setSave("Não foi possível guardar. Verifica a ligação.", true);
      return r;
    }, function () { setSave("Sem ligação. Tentamos de novo ao avançar.", true); });
  }

  // ---------- campos ----------
  function setAnswer(id, value, rerender, advanceFrom) {
    if (empty(value)) delete answers[id]; else answers[id] = value;
    delete errors[id];
    scheduleSave();
    if (advanceFrom) scrollTarget = advanceFrom;
    if (rerender) renderStep();
  }

  function choiceGroup(options, value, onPick, label, opts) {
    opts = opts || {};
    var multi = !!opts.multi;
    var wrap = el("div", "tmf-choices" + (opts.compact ? " is-compact" : ""));
    wrap.setAttribute("role", "group");
    if (label) wrap.setAttribute("aria-label", label);
    options.forEach(function (o, i) {
      var on = multi ? (value || []).indexOf(o[0]) >= 0 : value === o[0];
      var b = el("button", "tmf-choice" + (multi ? " is-multi" : ""), o[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      if (opts.swatches && URINE[i]) {
        var sw = el("span", "tmf-swatch"); sw.style.setProperty("background", URINE[i]); b.prepend(sw);
      }
      b.addEventListener("click", function () {
        if (!multi) { onPick(on ? "" : o[0]); return; }
        var list = (value || []).slice();
        if (on) list = list.filter(function (x) { return x !== o[0]; });
        else list.push(o[0]);
        onPick(list.length ? list : "");
      });
      wrap.append(b);
    });
    if (opts.ends) {
      var ends = el("div", "tmf-ends");
      ends.append(el("span", "", opts.ends[0]), el("span", "", opts.ends[1]));
      var box = el("div", "tmf-scale"); box.append(wrap, ends); return box;
    }
    return wrap;
  }

  function fieldNode(f) {
    var box = el("div", "tmf-field");
    box.dataset.field = f.id;
    if (errors[f.id]) box.classList.add("is-invalid");
    if (!empty(answers[f.id]) && !errors[f.id]) box.classList.add("is-answered");
    var id = "tmf-" + f.id;
    if (f.type !== "check" && f.type !== "freq") {
      var block = f.type === "choice" || f.type === "multi" || f.type === "freq" || f.type === "meals" || f.type === "details";
      var label = el(block ? "div" : "label", "tmf-label", f.label);
      if (label.tagName === "LABEL") label.htmlFor = id;
      if (f.type === "multi") label.append(" ", el("small", "", "(podes escolher várias)"));
      else if (!f.required && f.type !== "meals" && f.type !== "freq" && f.type !== "details" && !f.other_of) label.append(" ", el("small", "", "(opcional)"));
      if (f.other_of) box.classList.add("is-other");
      box.append(label);
    }
    var hint = f.hint || (f.hint_other && answers.for_whom === "other" ? f.hint_other : "");
    if (hint) box.append(el("div", "tmf-hint", hint));
    var v = answers[f.id];
    if (f.type === "choice" && f.photos && data.portions && Object.keys(data.portions[f.id] || {}).length) {
      box.append(photoChoices(f, v));
    } else if (f.type === "choice" || f.type === "multi") {
      box.append(choiceGroup(f.options, v, function (x) {
        setAnswer(f.id, x, true, f.type === "choice" && x ? f.id : null);
      }, f.label, {multi: f.type === "multi", compact: f.compact, swatches: f.swatches, ends: f.ends}));
      if (f.unit) box.append(el("div", "tmf-hint", f.unit));
    } else if (f.type === "text" || f.type === "date") {
      var i = el("input", "tmf-input");
      i.id = id; i.type = f.type === "date" ? "date" : "text";
      if (f.type === "date") i.max = new Date().toISOString().slice(0, 10);
      if (f.max) i.maxLength = f.max;
      if (f.placeholder) i.placeholder = f.placeholder;
      i.value = v || "";
      i.enterKeyHint = "next";
      i.addEventListener("input", function () { setAnswer(f.id, i.value.trim() ? i.value : ""); });
      box.append(i);
    } else if (f.type === "textarea") {
      var t = el("textarea", "tmf-textarea");
      t.id = id; if (f.max) t.maxLength = f.max;
      if (f.placeholder) t.placeholder = f.placeholder;
      t.value = v || "";
      t.addEventListener("input", function () { setAnswer(f.id, t.value.trim() ? t.value : ""); });
      box.append(t);
    } else if (f.type === "number" && (f.id === "height_cm" || f.id === "weight_kg")) {
      box.append(wheelField(f, box));
    } else if (f.type === "number") {
      var row = el("div", "tmf-unit");
      var n = el("input", "tmf-input");
      n.id = id; n.type = "text"; n.inputMode = "decimal"; n.autocomplete = "off"; n.enterKeyHint = "next";
      n.value = v == null ? "" : String(v).replace(".", ",");
      var err = el("div", "tmf-error");
      n.addEventListener("input", function () {
        var raw = n.value.trim().replace(",", ".");
        if (!raw) { setAnswer(f.id, ""); err.textContent = ""; box.classList.remove("is-invalid"); return; }
        var num = Number(raw);
        if (!isFinite(num) || num < f.min || num > f.max) {
          answers[f.id] = n.value; errors[f.id] = true;
          err.textContent = "Indica um valor entre " + f.min + " e " + f.max + " " + (f.unit || "") + ".";
          box.classList.add("is-invalid");
          return;
        }
        err.textContent = ""; box.classList.remove("is-invalid");
        setAnswer(f.id, num);
      });
      row.append(n, el("span", "", f.unit || ""));
      box.append(row, err);
    } else if (f.type === "check") {
      var lab = el("label", "tmf-check");
      var c = el("input");
      c.type = "checkbox"; c.checked = v === true;
      c.addEventListener("change", function () { setAnswer(f.id, c.checked ? true : ""); });
      var txt = el("span", "", f.label + " ");
      var link = el("a", "", "Como tratamos os teus dados");
      link.href = "https://themile.pt/policies/privacy-policy"; link.target = "_blank"; link.rel = "noopener";
      txt.append(link);
      lab.append(c, txt);
      box.append(lab);
      if (answers.for_whom === "other") box.append(el("div", "tmf-note", "Se a pessoa que vai à consulta for menor de 18 anos, és tu que dás este consentimento, como responsável."));
    } else if (f.type === "details") {
      box.append(detailsNode(f));
    } else if (f.type === "freq") {
      box.append(freqNode(f));
    } else if (f.type === "meals") {
      box.append(mealsNode(f));
    }
    if (errors[f.id] === "required") box.append(el("div", "tmf-error", f.type === "freq" ? "Falta responder aos alimentos assinalados." : "Esta resposta é necessária."));
    return box;
  }


  // Rodas para altura e peso (como na maqueta): arrastar, tocar nos números ou usar as setas.
  var ITEM_H = 40;
  function wheel(values, index, onPick, label, placeholder) {
    var box = el("div", "tmf-wheel" + (placeholder ? " is-placeholder" : ""));
    var list = el("div", "tmf-wheel-list");
    list.tabIndex = 0;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    values.forEach(function (v, i) {
      var it = el("div", "tmf-wheel-item", v);
      it.setAttribute("role", "option");
      it.addEventListener("click", function () { go(i, true); });
      list.append(it);
    });
    var current = index, timer = null, ready = false;
    function mark() {
      Array.prototype.forEach.call(list.children, function (c, i) {
        c.classList.toggle("is-on", i === current);
        c.setAttribute("aria-selected", String(i === current));
      });
    }
    function go(i, smooth) {
      current = Math.max(0, Math.min(values.length - 1, i));
      list.scrollTo({top: current * ITEM_H, behavior: smooth ? "smooth" : "auto"});
      mark(); box.classList.remove("is-placeholder"); onPick(current);
    }
    list.addEventListener("scroll", function () {
      if (!ready) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var i = Math.round(list.scrollTop / ITEM_H);
        if (i !== current || box.classList.contains("is-placeholder")) { current = i; mark(); box.classList.remove("is-placeholder"); onPick(i); }
      }, 120);
    });
    list.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") { e.preventDefault(); go(current - 1, true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); go(current + 1, true); }
    });
    box.append(list);
    mark();
    requestAnimationFrame(function () { list.scrollTop = current * ITEM_H; setTimeout(function () { ready = true; }, 200); });
    return box;
  }
  function wheelField(f, fieldBox) {
    var row = el("div", "tmf-wheels");
    var v = answers[f.id];
    function done(value) {
      setAnswer(f.id, value);
      fieldBox.classList.add("is-answered");
    }
    if (f.id === "height_cm") {
      var hs = [];
      for (var h = f.min; h <= f.max; h++) hs.push((h / 100).toFixed(2).replace(".", ","));
      var hi = v ? Math.round(v) - f.min : 165 - f.min;
      var w1 = el("div", "tmf-wheel-wrap");
      w1.append(wheel(hs, hi, function (i) { done(f.min + i); }, "Altura em metros", v == null), el("span", "tmf-wheel-unit", "m"));
      row.append(w1);
    } else {
      var ints = [], decs = [];
      for (var k = f.min; k <= f.max; k++) ints.push(String(k));
      for (var d = 0; d <= 9; d++) decs.push(String(d));
      var cur = v != null ? Number(v) : 65;
      var ii = Math.floor(cur) - f.min, di = Math.round((cur - Math.floor(cur)) * 10);
      var w2 = el("div", "tmf-wheel-wrap");
      function pick() { done(Math.round((f.min + ii + di / 10) * 10) / 10); }
      w2.append(wheel(ints, ii, function (i) { ii = i; pick(); }, "Peso, quilos", v == null),
        el("span", "tmf-wheel-comma", ","),
        wheel(decs, di, function (i) { di = i; pick(); }, "Peso, décimas", v == null),
        el("span", "tmf-wheel-unit", "kg"));
      row.append(w2);
    }
    return row;
  }

  // Frequência: uma linha por alimento com os dias por semana; «Todos» pede quantas vezes por dia.
  function weeklyOf(value) {
    if (!value) return "";
    if (value === "never" || value === "d1_2" || value === "d3_4" || value === "d5_6") return value;
    return "all";
  }
  function freqNode(f) {
    var wrap = el("div", "tmf-freq");
    var g = Object.assign({}, answers[f.id] || {});
    var done = f.rows.filter(function (r) { return g[r[0]]; }).length;
    var head = el("div", "tmf-freq-head");
    var bar = el("span", "tmf-freq-bar"); var fill = el("i"); bar.append(fill);
    fill.style.setProperty("width", Math.round(done / f.rows.length * 100) + "%");
    head.append(el("span", "tmf-freq-count", done + " de " + f.rows.length + " alimentos"), bar);
    wrap.append(head);
    f.rows.forEach(function (r) {
      var key = r[0], opts = r[3], value = g[key];
      var row = el("div", "tmf-freq-row");
      row.dataset.row = key;
      if (value) row.classList.add("is-done");
      if (errors[f.id] === "required" && !value) row.classList.add("is-missing");
      var name = el("div", "tmf-freq-name", r[1]);
      name.append(el("span", "tmf-freq-n", (f.rows.indexOf(r) + 1) + " de " + f.rows.length));
      if (r[2]) name.append(el("small", "", r[2]));
      var week = weeklyOf(value) || (dailyPending[key] ? "all" : "");
      var perDay = opts.filter(function (x) { return WEEKLY.every(function (w) { return w[0] !== x[0]; }); });
      var scale = el("div", "tmf-freq-scale");
      scale.setAttribute("role", "group"); scale.setAttribute("aria-label", r[1] + ", dias por semana");
      WEEKLY.forEach(function (o) {
        var b = el("button", "tmf-dot");
        b.append(el("strong", "", o[1]));
        if (o[2]) b.append(el("small", "", o[2]));
        b.type = "button";
        b.setAttribute("aria-pressed", String(week === o[0]));
        b.setAttribute("aria-label", r[1] + ": " + (o[0] === "never" ? "nunca" : o[0] === "all" ? "todos os dias" : o[1] + " dias por semana"));
        b.addEventListener("click", function () {
          var next = Object.assign({}, answers[f.id] || {});
          if (o[0] === "all") {
            if (perDay.length === 1) { next[key] = perDay[0][0]; delete dailyPending[key]; setAnswer(f.id, next, true, "freq:" + key); }
            else if (weeklyOf(next[key]) !== "all") { delete next[key]; dailyPending[key] = true; setAnswer(f.id, next, true); }
            return;
          }
          delete dailyPending[key];
          next[key] = o[0];
          setAnswer(f.id, next, true, "freq:" + key);
        });
        scale.append(b);
      });
      row.append(name, scale);
      if (week === "all" && perDay.length > 1) {
        var more = el("div", "tmf-freq-more");
        more.append(el("span", "", "Quantas vezes por dia?"));
        var chips = el("div", "tmf-freq-chips");
        perDay.forEach(function (x) {
          var c = el("button", "tmf-chip", x[1].replace(/^Todos os dias \(|\)$/g, "").replace("/dia", ""));
          c.type = "button";
          c.setAttribute("aria-pressed", String(value === x[0]));
          c.addEventListener("click", function () {
            var next = Object.assign({}, answers[f.id] || {});
            next[key] = x[0]; delete dailyPending[key];
            setAnswer(f.id, next, true, "freq:" + key);
          });
          chips.append(c);
        });
        more.append(chips);
        row.append(more);
      }
      wrap.append(row);
    });
    return wrap;
  }

  // Porções com fotografias da biblioteca Porções visuais.
  function photoChoices(f, value) {
    var wrap = el("div", "tmf-photos");
    wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", f.label);
    var photos = data.portions[f.id] || {};
    f.options.forEach(function (o) {
      var b = el("button", "tmf-photo");
      b.type = "button";
      b.setAttribute("aria-pressed", String(value === o[0]));
      if (photos[o[0]]) {
        var img = el("img");
        img.src = "formulario/porcao?t=" + encodeURIComponent(token) + "&id=" + photos[o[0]];
        img.alt = o[1]; img.loading = "lazy";
        b.append(img);
      }
      b.append(el("span", "", o[1]));
      b.addEventListener("click", function () { setAnswer(f.id, value === o[0] ? "" : o[0], true, value === o[0] ? null : f.id); });
      wrap.append(b);
    });
    return wrap;
  }

  // Uma linha por suplemento escolhido: marca, dose e quando.
  function detailsNode(f) {
    var wrap = el("div", "tmf-details");
    var parent = data.steps.map(function (st) { return st.fields; }).reduce(function (a, b) { return a.concat(b); })
      .filter(function (x) { return x.id === f.of; })[0];
    var labels = {};
    parent.options.forEach(function (o) { labels[o[0]] = o[1]; });
    var info = Object.assign({}, answers[f.id] || {});
    (answers[f.of] || []).filter(function (k) { return k !== "none"; }).forEach(function (key) {
      var row = el("div", "tmf-detail-row");
      var name = key === "other" ? (answers[f.of + "_other"] || "Outro") : labels[key];
      row.append(el("div", "tmf-detail-name", name));
      var cells = el("div", "tmf-detail-cells");
      f.columns.forEach(function (c, i) {
        var lab = el("label", "tmf-detail-cell");
        var inp = el("input", "tmf-input");
        inp.type = "text"; inp.maxLength = 120; inp.id = "tmf-" + f.id + "-" + key + "-" + c[0];
        inp.placeholder = (f.placeholders || [])[i] || "";
        inp.value = ((info[key] || {})[c[0]]) || "";
        inp.addEventListener("input", function () {
          var cur = Object.assign({}, info[key] || {});
          if (inp.value.trim()) cur[c[0]] = inp.value; else delete cur[c[0]];
          if (Object.keys(cur).length) info[key] = cur; else delete info[key];
          setAnswer(f.id, Object.assign({}, info));
        });
        lab.append(el("span", "", c[1]), inp);
        cells.append(lab);
      });
      row.append(cells);
      wrap.append(row);
    });
    return wrap;
  }

  // Diário: primeiro escolhem-se as refeições; cada uma abre hora, o que come e quantidades.
  function mealsNode(f) {
    var wrap = el("div", "tmf-meals");
    var meals = Object.assign({}, answers[f.id] || {});
    var chosen = f.rows.filter(function (r) { return meals[r[0]]; }).map(function (r) { return r[0]; });
    wrap.append(choiceGroup(f.rows, chosen, function (list) {
      var next = {};
      (list || []).forEach(function (k) { next[k] = meals[k] || {time: "", text: "", qty: "", on: true}; });
      setAnswer(f.id, next, true);
    }, f.label, {multi: true, compact: true}));
    function update(key, part, value) {
      var cur = Object.assign({time: "", text: "", qty: "", on: true}, meals[key] || {});
      cur[part] = value;
      meals[key] = cur;
      setAnswer(f.id, Object.assign({}, meals));
    }
    f.rows.forEach(function (r) {
      if (!meals[r[0]]) return;
      var m = meals[r[0]];
      var card = el("div", "tmf-meal");
      var head = el("div", "tmf-meal-head");
      var time = el("input", "tmf-input tmf-time");
      time.type = "time"; time.value = m.time || ""; time.setAttribute("aria-label", r[1] + " – hora");
      time.addEventListener("input", function () { update(r[0], "time", time.value); });
      var tl = el("label", "tmf-time-label");
      tl.append(el("span", "", "Hora"), time);
      head.append(el("div", "tmf-meal-name", r[1]), tl);
      var text = el("textarea", "tmf-textarea");
      text.maxLength = 600; text.value = m.text || ""; text.rows = 2;
      text.placeholder = "O que comes e bebes";
      text.setAttribute("aria-label", r[1] + " – o que comes");
      text.addEventListener("input", function () { update(r[0], "text", text.value); });
      var qty = el("input", "tmf-input");
      qty.type = "text"; qty.maxLength = 300; qty.value = m.qty || "";
      qty.placeholder = "Quantidades (ex.: 2 fatias de pão, 1 iogurte)";
      qty.setAttribute("aria-label", r[1] + " – quantidades");
      qty.addEventListener("input", function () { update(r[0], "qty", qty.value); });
      card.append(head, text, qty);
      wrap.append(card);
    });
    return wrap;
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  function icon(paths) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) { var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); svg.append(p); });
    return svg;
  }
  var ICON_SAVE = ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"];
  var ICON_LOCK = ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"];
  var ICON_CHECK = ["M5 12.5l4.5 4.5L19 7.5"];
  var LONG_DAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  function setMode(kind) { document.body.dataset.screen = kind; }
  function toast(text, badge) {
    var t = document.getElementById("tmf-toast");
    t.replaceChildren();
    if (badge) t.append(el("b", "", badge));
    t.append(el("span", "", text));
    t.hidden = false;
    t.classList.remove("is-out");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { t.hidden = true; }, 300); }, 4500);
  }
  function icsFile(b) {
    var start = b.date.replace(/-/g, "") + "T" + b.start.replace(":", "") + "00";
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Mile//Consulta//PT", "BEGIN:VEVENT",
      "UID:" + token.slice(0, 12) + "@themile.pt",
      "DTSTART;TZID=Europe/Lisbon:" + start,
      "DURATION:PT90M",
      "SUMMARY:" + b.service + " · The Mile",
      "LOCATION:" + (b.mode === "online" ? "Online" : ADDRESS.replace(/,/g, "\\,")),
      "DESCRIPTION:Com " + b.professional,
      "END:VEVENT", "END:VCALENDAR"];
    return new Blob([lines.join("\r\n")], {type: "text/calendar"});
  }

  // ---------- ecrãs ----------
  function bookingTop() {
    var b = data.booking;
    topInfo.textContent = "Formulário pré-consulta" + (b ? " · " + b.service + " · " + niceDate(b.date, b.start) : "");
  }

  function renderWelcome() {
    setMode("welcome");
    app.replaceChildren();
    var hero = el("section", "tmf-hero tmf-welcome tmf-enter");
    var b = data.booking;
    if (b) hero.append(el("span", "tmf-pill", b.service + " · " + niceDate(b.date, b.start)));
    var h = el("h1", "", "Olá" + firstName());
    var who = b && b.professional ? "A " + b.professional.split(" ")[0] : "A tua nutricionista";
    var facts = el("ul", "tmf-facts");
    [[el("b", "", "15'"), "Cerca de 15 minutos, em passos curtos"],
     [icon(ICON_SAVE), "Guarda sozinho. Podes parar e voltar a este link"],
     [icon(ICON_LOCK), "Só a equipa de nutrição vê as respostas"]].forEach(function (x) {
      var li = el("li"); var ic = el("span", "tmf-fact-icon"); ic.append(x[0]);
      li.append(ic, el("span", "", x[1])); facts.append(li);
    });
    var go = el("button", "tmf-btn tmf-btn-primary", "Começar");
    go.type = "button";
    go.addEventListener("click", function () { current = 0; renderStep(); window.scrollTo(0, 0); });
    var foot = el("div", "tmf-welcome-foot");
    foot.append(go, el("p", "", "Não há respostas certas ou erradas. Responde como é hoje, não como gostavas que fosse."));
    hero.append(h,
      el("p", "tmf-welcome-lead", "Antes da consulta, precisamos de algumas informações sobre a tua saúde, o teu treino e a tua alimentação. " + who + " vai lê-las para preparar a consulta e aproveitar melhor o tempo contigo."),
      facts, foot);
    app.append(hero);
    go.focus();
  }

  function renderDone() {
    setMode("done");
    app.replaceChildren();
    var hero = el("section", "tmf-hero tmf-done tmf-enter");
    var mark = el("div", "tmf-done-mark"); mark.append(icon(ICON_CHECK));
    hero.append(mark);
    hero.append(el("h1", "", "Obrigada" + (data.first_name ? ", " + data.first_name : "") + ". Está tudo pronto."));
    var b = data.booking;
    var until = "";
    if (b) { var d = new Date(b.date + "T12:00:00"); until = " Até " + LONG_DAY[d.getDay()] + ", dia " + d.getDate() + "."; }
    hero.append(el("p", "tmf-done-lead", "As tuas respostas ficaram guardadas." + until));
    if (b) {
      var box = el("div", "tmf-booking");
      box.append(el("strong", "", "A tua consulta"));
      var dl = el("dl");
      [["Quando", niceDate(b.date, b.start)],
       ["Onde", b.mode === "online" ? "Online (recebes o link por email)" : ADDRESS],
       ["Com", b.professional]].forEach(function (x) { dl.append(el("dt", "", x[0]), el("dd", "", x[1])); });
      box.append(dl);
      hero.append(box);
    }
    var tips = el("ol", "tmf-tips");
    var list = ["Traz análises recentes e outros documentos que consideres importantes."];
    if (!b || b.mode !== "online") list.unshift("Aconselhamos roupa confortável para a avaliação antropométrica completa (ex.: calções e/ou top desportivo). Se preferires, podes trocar de roupa nas nossas instalações.");
    list.forEach(function (t) { tips.append(el("li", "", t)); });
    hero.append(el("div", "tmf-done-title", "Para o dia"), tips);
    var actions = el("div", "tmf-done-actions");
    if (b) {
      var cal = el("a", "tmf-btn tmf-btn-primary", "Adicionar ao calendário");
      cal.href = URL.createObjectURL(icsFile(b)); cal.download = "consulta-the-mile.ics";
      actions.append(cal);
    }
    var review = el("button", "tmf-btn tmf-btn-ghost", "Rever as minhas respostas");
    review.type = "button";
    review.addEventListener("click", function () { mode = "review"; current = data.steps.indexOf(screens()[0]); renderStep(); window.scrollTo(0, 0); });
    actions.append(review);
    hero.append(actions);
    app.append(hero);
  }

  function milestone(pos, total) {
    if (mode === "review") return;
    var left = total - pos - 1;
    var mins = Math.max(1, Math.round(left * SECONDS_PER_SCREEN / 60));
    var pct = pos / total;
    var name = firstName() ? "," + firstName() : "";
    if (pct >= 0.5 && !shownToasts.half) { shownToasts.half = true; toast("Já vais a meio" + name + ". Faltam cerca de " + mins + " minutos.", "½"); }
    else if (pct >= 0.8 && !shownToasts.end) { shownToasts.end = true; toast("Falta pouco" + name + ". Mais " + left + (left === 1 ? " passo." : " passos."), "¾"); }
  }
  function cheer(pos, total) {
    var left = total - pos - 1;
    var mins = Math.max(1, Math.round(left * SECONDS_PER_SCREEN / 60));
    var pct = (pos + 1) / total;
    var name = firstName() ? "," + firstName() : "";
    if (pos === total - 1) return "Último passo!";
    if (pct >= 0.75) return "Falta pouco" + name + ". Cerca de " + mins + " min.";
    if (pct >= 0.5) return "Já vais a meio" + name + ". Faltam cerca de " + mins + " min.";
    if (pct >= 0.25) return "Bom ritmo! Faltam cerca de " + mins + " min.";
    return "Faltam cerca de " + mins + " min.";
  }

  function renderStep() {
    var list = screens();
    if (list.indexOf(data.steps[current]) < 0) current = data.steps.indexOf(list[0]);
    var step = data.steps[current];
    var pos = list.indexOf(step);
    var gs = groups(), gpos = gs.indexOf(step.group);
    var keepFocus = document.activeElement && document.activeElement.id;
    var scrollY = window.scrollY;
    setMode("step");
    app.replaceChildren();
    var progress = el("div", "tmf-progress");
    var ptext = el("div", "tmf-progress-text");
    ptext.append(el("span", "", "Passo " + (pos + 1) + " de " + list.length), el("span", "", step.group));
    var track = el("div", "tmf-progress-track"); var fill = el("span"); track.append(fill);
    fill.style.setProperty("width", Math.max(3, Math.round((pos + 1) / list.length * 100)) + "%");
    progress.append(ptext, track);

    var layout = el("div", "tmf-layout");
    var nav = el("nav", "tmf-steps");
    nav.setAttribute("aria-label", "Secções");
    gs.forEach(function (g, i) {
      var first = list.filter(function (s) { return s.group === g; })[0];
      var done = i < gpos || mode === "review";
      var b = el("button", "tmf-step-link" + (i === gpos ? " is-current" : done ? " is-done" : ""),
        (i < gpos ? "✓ " : "") + g);
      b.type = "button";
      if (i === gpos) b.setAttribute("aria-current", "step");
      b.addEventListener("click", function () { if (i <= gpos || mode === "review") go(data.steps.indexOf(first)); });
      nav.append(b);
    });
    var main = el("main", "tmf-main");
    var card = el("section", "tmf-card" + (lastRendered !== current ? " tmf-enter" : ""));
    lastRendered = current;
    var head = el("div");
    head.append(el("h1", "", step.group));
    card.append(head);
    if (mode === "review") card.append(el("div", "tmf-banner", "Já enviaste este formulário. As alterações que fizeres ficam guardadas e a equipa vê a versão mais recente."));
    var pair = null;
    step.fields.filter(visible).forEach(function (f) {
      var node = fieldNode(f);
      if (f.id === "height_cm" || f.id === "weight_kg") {
        if (!pair) {
          pair = el("div", "tmf-pair"); card.append(pair);
          card.append(el("div", "tmf-hint tmf-pair-hint", "Arrasta ou toca nos números de cima e de baixo. O peso tem quilos e décimas em rodas separadas."));
        }
        pair.append(node);
      } else card.append(node);
    });
    var bar2 = el("div", "tmf-nav");
    var back = el("button", "tmf-btn tmf-btn-ghost", "Anterior");
    back.type = "button"; back.disabled = pos === 0;
    back.addEventListener("click", function () { go(data.steps.indexOf(list[pos - 1])); });
    var last = pos === list.length - 1;
    var next = el("button", "tmf-btn tmf-btn-primary", last ? (mode === "review" ? "Guardar alterações" : "Enviar formulário") : "Seguinte");
    next.type = "button";
    next.id = "tmf-next";
    next.addEventListener("click", function () { advance(step, last, next); });
    bar2.append(back, next);
    var saved = el("div", "tmf-save", "Guardado automaticamente");
    saved.id = "tmf-save"; saved.setAttribute("aria-live", "polite");
    card.append(bar2, saved);
    main.append(progress, card);
    layout.append(nav, main);
    app.append(layout);

    window.scrollTo(0, scrollY);
    if (scrollTarget) { var t = scrollTarget; scrollTarget = null; flowTo(t); }
    else if (keepFocus && document.getElementById(keepFocus)) document.getElementById(keepFocus).focus({preventScroll: true});
  }

  // Depois de responder, leva suavemente à pergunta (ou ao alimento) seguinte.
  function flowTo(from) {
    var target = null;
    if (from.indexOf("freq:") === 0) {
      var rows = Array.prototype.slice.call(app.querySelectorAll(".tmf-freq-row"));
      var i = rows.findIndex(function (r) { return r.dataset.row === from.slice(5); });
      target = rows.slice(i + 1).filter(function (r) { return !r.classList.contains("is-done"); })[0];
    } else {
      var fields = Array.prototype.slice.call(app.querySelectorAll(".tmf-field"));
      var k = fields.findIndex(function (b) { return b.dataset.field === from; });
      target = fields.slice(k + 1).filter(function (b) { return !b.classList.contains("is-answered"); })[0];
    }
    if (!target) target = document.getElementById("tmf-next");
    if (!target) return;
    var rect = target.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 40 || rect.top < 60) {
      window.scrollTo({top: window.scrollY + rect.top - window.innerHeight * 0.3, behavior: "smooth"});
    }
  }

  function advance(step, last, button) {
    if (!validate(step)) { renderStep(); focusError(); return; }
    var list = screens(), pos = list.indexOf(step);
    if (last) submit(button); else go(data.steps.indexOf(list[pos + 1]));
  }

  function go(index) {
    current = index;
    saveNow();
    window.scrollTo(0, 0);
    renderStep();
    var list = screens();
    milestone(list.indexOf(data.steps[current]), list.length);
  }

  function validate(step) {
    var ok = true;
    step.fields.filter(visible).forEach(function (f) {
      if (errors[f.id] === true) ok = false;
      else if (f.required && empty(answers[f.id])) { errors[f.id] = "required"; ok = false; }
      else if (f.required && f.type === "freq" && f.rows.some(function (r) { return !(answers[f.id] || {})[r[0]]; })) {
        errors[f.id] = "required"; ok = false;
      }
    });
    return ok;
  }
  function focusError() {
    var bad = app.querySelector(".tmf-freq-row.is-missing, .tmf-field.is-invalid");
    if (bad) { bad.scrollIntoView({block: "center", behavior: "smooth"}); var i = bad.querySelector("input,textarea,button"); if (i) i.focus({preventScroll: true}); }
  }

  function submit(button) {
    var list = screens();
    for (var i = 0; i < list.length; i++) {
      if (!validate(list[i])) { current = data.steps.indexOf(list[i]); renderStep(); focusError(); return; }
    }
    button.disabled = true;
    setSave("A enviar…");
    clearTimeout(saveTimer);
    api("enviar", {answers: prune(), step: current}).then(function (r) {
      if (r.ok) { data.status = "submitted"; mode = "fill"; renderDone(); window.scrollTo(0, 0); return; }
      button.disabled = false;
      setSave("Não foi possível enviar. Tenta de novo.", true);
    }, function () {
      button.disabled = false;
      setSave("Sem ligação. Tenta de novo.", true);
    });
  }

  // Enter num campo curto passa ao passo seguinte.
  app.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT" || e.target.type === "checkbox") return;
    e.preventDefault();
    var n = document.getElementById("tmf-next");
    if (n) n.click();
  });

  function fail(text) {
    app.replaceChildren();
    var hero = el("section", "tmf-hero");
    hero.append(el("h1", "", "Este link não está disponível."),
      el("p", "", text || "Pode ter expirado ou estar incompleto. Responde à mensagem em que recebeste o link e enviamos-te um novo."));
    app.append(hero);
  }

  if (!token) { fail(); return; }
  api("dados").then(function (r) {
    if (!r.ok) { fail(r.status === 404 ? null : "Não foi possível abrir o formulário. Tenta de novo daqui a pouco."); return; }
    data = r.body;
    answers = data.answers || {};
    current = Math.min(data.step || 0, data.steps.length - 1);
    bookingTop();
    if (data.status === "submitted") renderDone();
    else if (Object.keys(answers).length === 0) renderWelcome();
    else renderStep();
  }, function () { fail("Sem ligação à internet. Tenta de novo."); });
})();
