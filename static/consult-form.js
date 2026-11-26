/* Formulário pré-consulta da The Mile (página oculta em themile.pt, aberta só pelo link). */
(function () {
  "use strict";
  var token = new URLSearchParams(location.search).get("t") || "";
  var app = document.getElementById("tmf-app");
  var saveEl = document.getElementById("tmf-save");
  var topInfo = document.getElementById("tmf-top-info");
  var data = null;          // resposta de /dados
  var answers = {};
  var current = 0;          // índice em data.steps (ecrãs)
  var mode = "fill";        // fill | review (depois de enviado)
  var saveTimer = null;
  var errors = {};
  var dailyPending = {};    // alimentos com «Todos» à espera de «quantas vezes por dia»
  var scrollTarget = null;

  var WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var ADDRESS = "Largo das Hortas 220 N, Guimarães";
  var URINE = ["#fbf6d9", "#f7eeaa", "#f1df74", "#e9cc45", "#d9b22a", "#c4951c", "#a87a14"];
  // Frequência: primeiro os dias por semana; «Todos» abre «quantas vezes por dia» quando há mais do que uma opção.
  var WEEKLY = [["never", "Nunca"], ["d1_2", "1–2"], ["d3_4", "3–4"], ["d5_6", "5–6"], ["all", "Todos"]];
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
      var block = f.type === "choice" || f.type === "multi" || f.type === "freq" || f.type === "meals";
      var label = el(block ? "div" : "label", "tmf-label", f.label);
      if (label.tagName === "LABEL") label.htmlFor = id;
      if (f.type === "multi") label.append(" ", el("small", "", "(podes escolher várias)"));
      else if (!f.required && f.type !== "meals" && f.type !== "freq" && !f.other_of) label.append(" ", el("small", "", "(opcional)"));
      if (f.other_of) box.classList.add("is-other");
      box.append(label);
    }
    var hint = f.type === "freq" ? "" : f.hint || (f.hint_other && answers.for_whom === "other" ? f.hint_other : "");
    if (hint) box.append(el("div", "tmf-hint", hint));
    var v = answers[f.id];
    if (f.type === "choice" || f.type === "multi") {
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
    } else if (f.type === "freq") {
      box.append(freqNode(f));
    } else if (f.type === "meals") {
      box.append(mealsNode(f));
    }
    if (errors[f.id] === "required") box.append(el("div", "tmf-error", f.type === "freq" ? "Falta responder aos alimentos assinalados." : "Esta resposta é necessária."));
    return box;
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
    head.append(el("span", "tmf-freq-count", "Dias por semana · " + done + " de " + f.rows.length + " alimentos"), bar);
    wrap.append(head);
    f.rows.forEach(function (r) {
      var key = r[0], opts = r[3], value = g[key];
      var row = el("div", "tmf-freq-row");
      row.dataset.row = key;
      if (value) row.classList.add("is-done");
      if (errors[f.id] === "required" && !value) row.classList.add("is-missing");
      var name = el("div", "tmf-freq-name", r[1]);
      if (r[2]) name.append(el("small", "", r[2]));
      var week = weeklyOf(value) || (dailyPending[key] ? "all" : "");
      var perDay = opts.filter(function (x) { return WEEKLY.every(function (w) { return w[0] !== x[0]; }); });
      var scale = el("div", "tmf-freq-scale");
      scale.setAttribute("role", "group"); scale.setAttribute("aria-label", r[1] + ", dias por semana");
      WEEKLY.forEach(function (o) {
        var b = el("button", "tmf-dot", o[1]);
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

  function mealsNode(f) {
    var wrap = el("div", "tmf-meals");
    var meals = Object.assign({}, answers[f.id] || {});
    function update(key, part, value, card) {
      var cur = Object.assign({time: "", text: ""}, meals[key] || {});
      cur[part] = value;
      if (!cur.time && !cur.text.trim()) delete meals[key]; else meals[key] = cur;
      card.classList.toggle("is-done", !!meals[key]);
      setAnswer(f.id, Object.assign({}, meals));
    }
    f.rows.forEach(function (r) {
      var card = el("div", "tmf-meal");
      var m = meals[r[0]] || {};
      if (meals[r[0]]) card.classList.add("is-done");
      var head = el("div", "tmf-meal-head");
      var time = el("input", "tmf-input tmf-time");
      time.type = "time"; time.value = m.time || ""; time.setAttribute("aria-label", r[1] + " – hora");
      time.addEventListener("input", function () { update(r[0], "time", time.value, card); });
      head.append(el("div", "tmf-meal-name", r[1]), time);
      var text = el("textarea", "tmf-textarea");
      text.maxLength = 600; text.value = m.text || ""; text.rows = 2;
      text.placeholder = "O que costumas comer e beber (deixa em branco se não fazes)";
      text.setAttribute("aria-label", r[1] + " – o que comes");
      text.addEventListener("input", function () { update(r[0], "text", text.value, card); });
      card.append(head, text);
      wrap.append(card);
    });
    return wrap;
  }

  // ---------- ecrãs ----------
  function bookingTop() {
    var b = data.booking;
    topInfo.textContent = "Formulário pré-consulta" + (b ? " · " + b.service + " · " + niceDate(b.date, b.start) : "");
  }

  function renderWelcome() {
    app.replaceChildren();
    var hero = el("section", "tmf-hero tmf-enter");
    var h = el("h1", "", "Olá" + firstName() + ",");
    h.append(el("span", "", "vamos preparar a tua consulta."));
    var who = data.booking && data.booking.professional ? "A " + data.booking.professional.split(" ")[0] : "A tua nutricionista";
    var facts = el("ul", "tmf-facts");
    [["15'", "Cerca de 15 minutos, em passos curtos"],
     ["✓", "Guarda sozinho. Podes parar e voltar a este link"],
     ["✓", "Só a equipa de nutrição vê as respostas"]].forEach(function (x) {
      var li = el("li"); li.append(el("b", "", x[0]), el("span", "", x[1])); facts.append(li);
    });
    var go = el("button", "tmf-btn tmf-btn-primary", "Começar");
    go.type = "button";
    go.addEventListener("click", function () { current = 0; renderStep(); window.scrollTo(0, 0); });
    hero.append(h,
      el("p", "", "Antes da consulta, queremos conhecer-te um pouco melhor. " + who + " vai ler as tuas respostas para que o tempo em consulta seja dedicado ao que é importante para ti."),
      facts, go,
      el("p", "tmf-small", "Não há respostas certas ou erradas. Responde como é hoje, não como gostavas que fosse."));
    app.append(hero);
    go.focus();
  }

  function renderDone() {
    app.replaceChildren();
    var hero = el("section", "tmf-hero tmf-enter");
    hero.append(el("div", "tmf-done-mark", "✓"));
    hero.append(el("h1", "", "Obrigada" + (data.first_name ? ", " + data.first_name : "") + ". Está tudo pronto."));
    var b = data.booking;
    hero.append(el("p", "", "As tuas respostas ficaram guardadas." + (b ? " Até " + niceDate(b.date) + "." : "")));
    if (b) {
      var dl = el("dl", "tmf-booking");
      [["Quando", niceDate(b.date, b.start)],
       ["Onde", b.mode === "online" ? "Online (recebes o link por email)" : ADDRESS],
       ["Com", b.professional]].forEach(function (x) { dl.append(el("dt", "", x[0]), el("dd", "", x[1])); });
      hero.append(dl);
    }
    var tips = el("ul", "tmf-tips");
    var list = ["Traz análises recentes e outros documentos que consideres importantes."];
    if (!b || b.mode !== "online") list.unshift("Aconselhamos roupa confortável para a avaliação antropométrica completa (ex.: calções e/ou top desportivo). Se preferires, podes trocar de roupa nas nossas instalações.");
    list.forEach(function (t, i) { var li = el("li"); li.append(el("b", "", String(i + 1)), el("span", "", t)); tips.append(li); });
    hero.append(el("div", "tmf-label", "Para o dia"), tips);
    var review = el("button", "tmf-btn tmf-btn-ghost", "Rever as minhas respostas");
    review.type = "button";
    review.addEventListener("click", function () { mode = "review"; current = data.steps.indexOf(screens()[0]); renderStep(); window.scrollTo(0, 0); });
    hero.append(review);
    app.append(hero);
    setSave("");
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
    app.replaceChildren();

    var progress = el("div", "tmf-progress");
    var track = el("div", "tmf-progress-track"); var fill = el("span"); track.append(fill);
    fill.style.setProperty("width", Math.max(3, Math.round(pos / list.length * 100)) + "%");
    var ptext = el("div", "tmf-progress-text");
    ptext.append(el("span", "", "Passo " + (pos + 1) + " de " + list.length), el("span", "", mode === "review" ? "" : cheer(pos, list.length)));
    progress.append(track, ptext);

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
    var card = el("section", "tmf-card" + (scrollTarget ? "" : " tmf-enter"));
    var head = el("div");
    head.append(el("div", "tmf-kicker", step.group), el("h1", "", step.title));
    if (step.intro) head.append(el("p", "tmf-intro", step.intro));
    card.append(head);
    if (mode === "review") card.append(el("div", "tmf-banner", "Já enviaste este formulário. As alterações que fizeres ficam guardadas e a equipa vê a versão mais recente."));
    step.fields.filter(visible).forEach(function (f) { card.append(fieldNode(f)); });
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
    card.append(bar2);
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
