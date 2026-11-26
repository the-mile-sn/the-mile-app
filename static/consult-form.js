/* Formulário pré-consulta da The Mile (página oculta em themile.pt, aberta só pelo link). */
(function () {
  "use strict";
  var token = new URLSearchParams(location.search).get("t") || "";
  var app = document.getElementById("tmf-app");
  var saveEl = document.getElementById("tmf-save");
  var topInfo = document.getElementById("tmf-top-info");
  var data = null;          // resposta de /dados
  var answers = {};
  var current = 0;          // índice no STEPS completo
  var mode = "fill";        // fill | review (depois de enviado)
  var saveTimer = null;
  var errors = {};

  var WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var ADDRESS = "Largo das Hortas 220 N, Guimarães";

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
  function visible(item) {
    var when = item.when || {};
    return Object.keys(when).every(function (k) { return answers[k] === when[k]; });
  }
  function steps() { return data.steps.filter(visible); }
  function stepPos() { return steps().indexOf(data.steps[current]); }
  function empty(v) {
    return v == null || v === "" || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
  }
  function prune() {
    // Respostas escondidas (ex.: passo de saúde feminina) não são enviadas.
    var out = {};
    data.steps.forEach(function (s) {
      var sv = visible(s);
      s.fields.forEach(function (f) {
        if (!sv || !visible(f) || empty(answers[f.id]) || errors[f.id]) return;
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
  function setAnswer(id, value, rerender) {
    if (empty(value)) delete answers[id]; else answers[id] = value;
    delete errors[id];
    scheduleSave();
    if (rerender) renderStep();
  }

  function choiceGroup(options, value, onPick, label) {
    var wrap = el("div", "tmf-choices");
    wrap.setAttribute("role", "group");
    if (label) wrap.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = el("button", "tmf-choice", o[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(value === o[0]));
      b.addEventListener("click", function () { onPick(value === o[0] ? "" : o[0]); });
      wrap.append(b);
    });
    return wrap;
  }

  function fieldNode(f) {
    var box = el("div", "tmf-field");
    if (errors[f.id]) box.classList.add("is-invalid");
    var id = "tmf-" + f.id;
    var label;
    if (f.type !== "check") {
      label = el(f.type === "choice" || f.type === "grid" || f.type === "meals" ? "div" : "label", "tmf-label", f.label);
      if (label.tagName === "LABEL") label.htmlFor = id;
      if (!f.required && f.type !== "grid" && f.type !== "meals") label.append(" ", el("small", "", "(opcional)"));
      box.append(label);
    }
    var hint = f.hint || (f.hint_other && answers.for_whom === "other" ? f.hint_other : "");
    if (hint) box.append(el("div", "tmf-hint", hint));
    var v = answers[f.id];
    if (f.type === "choice") {
      box.append(choiceGroup(f.options, v, function (x) { setAnswer(f.id, x, true); }, f.label));
    } else if (f.type === "text" || f.type === "date") {
      var i = el("input", "tmf-input");
      i.id = id; i.type = f.type === "date" ? "date" : "text";
      if (f.type === "date") i.max = new Date().toISOString().slice(0, 10);
      if (f.max) i.maxLength = f.max;
      if (f.placeholder) i.placeholder = f.placeholder;
      i.value = v || "";
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
      n.id = id; n.type = "text"; n.inputMode = "decimal"; n.autocomplete = "off";
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
    } else if (f.type === "grid") {
      box.append(gridTable(f), gridCards(f));
    } else if (f.type === "meals") {
      box.append(mealsNode(f));
    }
    if (errors[f.id] === "required") box.append(el("div", "tmf-error", "Esta resposta é necessária."));
    return box;
  }

  function gridValue(f) { return Object.assign({}, answers[f.id] || {}); }
  function pickGrid(f, key, opt) {
    var g = gridValue(f);
    if (g[key] === opt) delete g[key]; else g[key] = opt;
    setAnswer(f.id, g, true);
  }
  function gridTable(f) {
    var table = el("table", "tmf-grid");
    var head = el("tr");
    head.append(el("th", "", "Alimento"));
    f.options.forEach(function (o) { var th = el("th", "", o[1]); th.scope = "col"; head.append(th); });
    var thead = el("thead"); thead.append(head);
    var tbody = el("tbody");
    var g = gridValue(f);
    f.rows.forEach(function (r) {
      var tr = el("tr");
      var name = el("td", "", r[1]);
      if (r[2]) name.append(el("small", "", r[2]));
      tr.append(name);
      f.options.forEach(function (o) {
        var td = el("td");
        var b = el("button", "tmf-dot");
        b.type = "button";
        b.setAttribute("aria-pressed", String(g[r[0]] === o[0]));
        b.setAttribute("aria-label", r[1] + ": " + o[1]);
        b.addEventListener("click", function () { pickGrid(f, r[0], o[0]); });
        td.append(b); tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    return table;
  }
  function gridCards(f) {
    var wrap = el("div", "tmf-grid-cards");
    var g = gridValue(f);
    f.rows.forEach(function (r) {
      var card = el("div", "tmf-grid-card");
      var title = el("b", "", r[1]);
      if (r[2]) title.append(" ", el("small", "", r[2]));
      card.append(title, choiceGroup(f.options, g[r[0]], function (x) { pickGrid(f, r[0], x || g[r[0]]); }, r[1]));
      wrap.append(card);
    });
    return wrap;
  }
  function mealsNode(f) {
    var wrap = el("div", "tmf-meals");
    var meals = Object.assign({}, answers[f.id] || {});
    function update(key, part, value) {
      var cur = Object.assign({time: "", text: ""}, meals[key] || {});
      cur[part] = value;
      if (!cur.time && !cur.text.trim()) delete meals[key]; else meals[key] = cur;
      setAnswer(f.id, Object.assign({}, meals));
    }
    f.rows.forEach(function (r) {
      var row = el("div", "tmf-meal");
      var m = meals[r[0]] || {};
      var time = el("input", "tmf-input");
      time.type = "time"; time.value = m.time || ""; time.setAttribute("aria-label", r[1] + " – hora");
      time.addEventListener("input", function () { update(r[0], "time", time.value); });
      var text = el("textarea", "tmf-textarea");
      text.maxLength = 600; text.value = m.text || ""; text.placeholder = "O que costumas comer e beber";
      text.setAttribute("aria-label", r[1] + " – o que comes");
      text.addEventListener("input", function () { update(r[0], "text", text.value); });
      row.append(el("div", "tmf-meal-name", r[1]), time, text);
      wrap.append(row);
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
    var hero = el("section", "tmf-hero");
    var h = el("h1", "", "Olá" + (data.first_name ? " " + data.first_name : "") + ",");
    h.append(el("span", "", "vamos preparar a tua consulta."));
    var who = data.booking && data.booking.professional ? "A " + data.booking.professional.split(" ")[0] : "A tua nutricionista";
    var facts = el("ul", "tmf-facts");
    [["10'", "Cerca de 10 minutos, em passos curtos"],
     ["✓", "Guarda sozinho. Podes parar e voltar a este link"],
     ["✓", "Só a equipa de nutrição vê as respostas"]].forEach(function (x) {
      var li = el("li"); li.append(el("b", "", x[0]), el("span", "", x[1])); facts.append(li);
    });
    var go = el("button", "tmf-btn tmf-btn-primary", "Começar");
    go.type = "button";
    go.addEventListener("click", function () { current = 0; renderStep(); });
    hero.append(h,
      el("p", "", "Antes da consulta, queremos conhecer-te um pouco melhor. " + who + " vai ler as tuas respostas para que o tempo em consulta seja dedicado ao que é importante para ti."),
      facts, go,
      el("p", "tmf-small", "Não há respostas certas ou erradas. Responde como é hoje, não como gostavas que fosse."));
    app.append(hero);
    go.focus();
  }

  function renderDone() {
    app.replaceChildren();
    var hero = el("section", "tmf-hero");
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
    review.addEventListener("click", function () { mode = "review"; current = 0; renderStep(); });
    hero.append(review);
    app.append(hero);
    setSave("");
  }

  function renderStep() {
    var list = steps();
    if (list.indexOf(data.steps[current]) < 0) current = data.steps.indexOf(list[0]);
    var step = data.steps[current];
    var pos = list.indexOf(step);
    var keepFocus = document.activeElement && document.activeElement.id;
    var scrollY = window.scrollY;
    app.replaceChildren();
    var layout = el("div", "tmf-layout");
    var nav = el("nav", "tmf-steps");
    nav.setAttribute("aria-label", "Passos");
    list.forEach(function (s, i) {
      var done = i < pos || mode === "review";
      var b = el("button", "tmf-step-link" + (i === pos ? " is-current" : done ? " is-done" : ""),
        (i < pos ? "✓ " : "") + (i + 1) + " · " + s.title);
      b.type = "button";
      if (i === pos) b.setAttribute("aria-current", "step");
      b.addEventListener("click", function () { if (i <= pos || mode === "review") go(data.steps.indexOf(s)); });
      nav.append(b);
    });
    var main = el("main", "tmf-main");
    var card = el("section", "tmf-card");
    var prog = el("div", "tmf-progress"); var bar = el("span"); prog.append(bar);
    bar.style.setProperty("width", Math.round((pos + 1) / list.length * 100) + "%");
    var head = el("div");
    head.append(el("div", "tmf-kicker", "Passo " + (pos + 1) + " de " + list.length), el("h1", "", step.title));
    card.append(prog, head);
    if (mode === "review") card.append(el("div", "tmf-banner", "Já enviaste este formulário. As alterações que fizeres ficam guardadas e a equipa vê a versão mais recente."));
    step.fields.filter(visible).forEach(function (f) { card.append(fieldNode(f)); });
    var bar2 = el("div", "tmf-nav");
    var back = el("button", "tmf-btn tmf-btn-ghost", "Anterior");
    back.type = "button"; back.disabled = pos === 0;
    back.addEventListener("click", function () { go(data.steps.indexOf(list[pos - 1])); });
    var last = pos === list.length - 1;
    var next = el("button", "tmf-btn tmf-btn-primary", last ? (mode === "review" ? "Guardar alterações" : "Enviar formulário") : "Seguinte");
    next.type = "button";
    next.addEventListener("click", function () {
      if (!validate(step)) { renderStep(); focusError(); return; }
      if (last) submit(next); else go(data.steps.indexOf(list[pos + 1]));
    });
    bar2.append(back, next);
    card.append(bar2);
    main.append(card);
    layout.append(nav, main);
    app.append(layout);
    if (keepFocus && document.getElementById(keepFocus)) {
      document.getElementById(keepFocus).focus();
      window.scrollTo(0, scrollY);
    }
  }

  function go(index) {
    current = index;
    saveNow();
    renderStep();
    window.scrollTo(0, 0);
  }

  function validate(step) {
    var ok = true;
    step.fields.filter(visible).forEach(function (f) {
      if (errors[f.id] === true) ok = false;
      else if (f.required && empty(answers[f.id])) { errors[f.id] = "required"; ok = false; }
    });
    return ok;
  }
  function focusError() {
    var bad = app.querySelector(".tmf-field.is-invalid, .tmf-error");
    if (bad) { bad.scrollIntoView({block: "center"}); var i = bad.querySelector("input,textarea,button"); if (i) i.focus(); }
  }

  function submit(button) {
    // Confirma todos os passos antes de enviar.
    var list = steps();
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
