"use strict";
/* Consultas: lista (Hoje / Por tratar / Todos), ficha do cliente e modo consulta
   (Nota → Fecho). Lê marcações e perfis; escreve apenas o registo da consulta. */
(() => {
 const $ = id => document.getElementById(id);
 const root = $("tm-cq-root"), auth = $("tm-cq-auth");
 // Menu principal recolhido (ícones) como no Início; abre ao passar o rato.
 root.classList.add("tm-sidebar-hover-enabled");
 setTimeout(() => {
  for (const a of root.querySelectorAll(".tm-admin-nav-link")) {
   const label = a.querySelector("span:not(.tm-admin-nav-icon)")?.textContent?.trim();
   if (label && !a.hasAttribute("title")) a.setAttribute("title", label);
   if (label && !a.hasAttribute("aria-label")) a.setAttribute("aria-label", label);
  }
 }, 0);
 if (!root || !auth) return;
 const API = "/api/v2/admin/consultations";
 const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
 const WEEKDAYS = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
 const INDICATORS = [["adherence","Adesão ao plano"],["energy","Energia nos treinos"],["sleep","Sono"],
  ["digestion","Conforto digestivo"],["hunger","Fome e saciedade"],["hydration","Hidratação"]];
 const MESSAGES = {stale_session:"Esta consulta foi alterada noutro lado. Recarreguei os dados.",
  session_closed:"Esta consulta já está fechada.", booking_not_linked:"Esta marcação ainda não está ligada a um perfil.",
  invalid_objectives:"Confirma os objetivos.", invalid_next_weeks:"Escolhe quando é a próxima consulta.",
  stale_assessment:"A avaliação foi alterada noutro lado. Sai e volta a entrar na consulta.", invalid_measures:"Confirma as medições."};
 let csrf = "", data = null, tab = "today", query = "", openClient = null, focus = null, saveTimer = null, saving = false, dirty = false;

 const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
 const initials = name => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
 const dayLabel = iso => { const d = new Date(iso + "T12:00:00Z"); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
 const longDay = iso => { const d = new Date(iso + "T12:00:00Z"); return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
 const ageOf = birth => { if (!birth) return ""; const b = new Date(birth + "T12:00:00"), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a + " anos"; };
 const feedback = (msg, error) => { const f = $("tm-cq-feedback"); f.textContent = msg || ""; f.classList.toggle("is-error", !!error); };

 async function api(path, options = {}) {
  const write = options.method && options.method !== "GET";
  const res = await fetch(path, {credentials: "same-origin", cache: "no-store", ...options,
   headers: {"Accept": "application/json", ...(write ? {"Content-Type": "application/json", "X-CSRF-Token": csrf} : {})}});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = Error(MESSAGES[body.error] || "Não foi possível concluir. Tenta novamente."); e.code = body.error; throw e; }
  return body;
 }

 /* ---------- lista ---------- */
 function itemStatus(it) {
  if (it.session_status === "closed") return ["done", "Consulta fechada"];
  if (it.session_status === "open") return ["pending", "Em curso · falta fechar"];
  if (it.first_visit) return ["info", "Primeira consulta"];
  return ["info", "Seguimento"];
 }
 function listRow(name, sub, right, dot, onClick, active) {
  const b = el("button", "tm-cq-row" + (active ? " is-active" : "")); b.type = "button";
  const av = el("span", "tm-cq-avatar", initials(name));
  const copy = el("span", "tm-cq-row-copy");
  copy.append(el("strong", "", name));
  const s = el("span", "tm-cq-row-sub"); if (dot) s.append(el("i", "tm-cq-dot is-" + dot)); s.append(document.createTextNode(sub)); copy.append(s);
  b.append(av, copy, el("span", "tm-cq-row-time", right));
  b.addEventListener("click", onClick);
  return b;
 }
 function renderList() {
  const list = $("tm-cq-list"); list.replaceChildren();
  if (!data) return;
  const q = query.trim().toLowerCase();
  const match = name => !q || (name || "").toLowerCase().includes(q);
  const counts = {today: data.today.length, pending: data.pending.length, all: data.clients.length};
  for (const b of document.querySelectorAll(".tm-cq-segment [data-tab]")) {
   b.setAttribute("aria-selected", String(b.dataset.tab === tab));
   b.querySelector("span").textContent = counts[b.dataset.tab] ? "· " + counts[b.dataset.tab] : "";
  }
  const group = (title, items, timeOf) => {
   const rows = items.filter(it => match(it.client_name));
   if (!rows.length) return 0;
   list.append(el("p", "tm-cq-group", title));
   for (const it of rows) {
    const [dot, sub] = itemStatus(it);
    list.append(listRow(it.client_name, sub, timeOf(it), dot, () => selectClient(it.client_id), openClient === it.client_id));
   }
   return rows.length;
  };
  let shown = 0;
  if (tab === "today") {
   shown += group("Hoje, " + longDay(data.date), data.today, it => it.start);
   shown += group("Próximos dias", data.upcoming, it => dayLabel(it.date));
  } else if (tab === "pending") {
   shown += group("Consultas por fechar", data.pending, it => dayLabel(it.date));
  } else {
   const rows = data.clients.filter(c => match(c.name));
   if (rows.length) list.append(el("p", "tm-cq-group", "Clientes de consulta"));
   for (const c of rows) {
    const sub = c.status === "pending" ? "Perfil por confirmar" : (c.next_booking ? "Próxima: " + dayLabel(c.next_booking.day || c.next_booking.date || "") : "Sem marcações futuras");
    list.append(listRow(c.name, sub, "", c.status === "pending" ? "pending" : "", () => selectClient(c.id), openClient === c.id));
   }
   shown = rows.length;
  }
  if (!shown) list.append(el("p", "tm-cq-empty", tab === "pending" ? "Nada por tratar." : "Sem consultas para mostrar."));
 }

 async function loadWorkspace() {
  data = await api(API);
  renderList();
 }

 /* ---------- ficha ---------- */
 async function selectClient(id) {
  openClient = id; renderList();
  const host = $("tm-cq-detail"); host.replaceChildren(el("p", "tm-cq-empty", "A carregar…"));
  try { renderDetail(await api(API + "/clients/" + encodeURIComponent(id))); }
  catch (e) { host.replaceChildren(el("p", "tm-cq-empty", e.message)); }
 }
 function renderDetail(view) {
  const host = $("tm-cq-detail"); host.replaceChildren();
  const p = view.profile;
  const head = el("header", "tm-cq-person");
  head.append(el("span", "tm-cq-avatar is-large", initials(p.name)));
  const who = el("div", "tm-cq-person-copy");
  who.append(el("h2", "", p.name));
  const meta = [ageOf(p.birth_date), p.email, p.phone].filter(Boolean).join(" · ");
  who.append(el("p", "tm-cq-muted", meta || "Sem dados de contacto"));
  head.append(who);
  const profileLink = el("a", "tm-cq-ghost", "Acessos"); profileLink.href = "/?nav=players";
  profileLink.title = "Dados pessoais e acessos (Clientes → Consultas)";
  head.append(profileLink);
  host.append(head);

  const next = view.next;
  const hero = el("section", "tm-cq-card tm-cq-hero");
  if (next) {
   const left = el("div", "tm-cq-hero-copy");
   const when = next.date === (data && data.date) ? "Hoje às " + next.start : longDay(next.date) + " às " + next.start;
   left.append(el("p", "tm-cq-accent", when));
   left.append(el("h3", "", next.service_name + " · " + (next.mode === "online" ? "online" : "presencial")));
   const tags = el("div", "tm-cq-tags");
   tags.append(el("span", "tm-cq-pill", next.professional_name));
   if (next.kind === "shopify") tags.append(el("span", "tm-cq-pill is-positive", "Pago no site"));
   left.append(tags);
   const action = el("button", "tm-cq-primary", next.session_status === "open" ? "Continuar consulta" : "Começar consulta");
   action.type = "button";
   action.addEventListener("click", () => startConsultation(next.kind, next.booking_id));
   const top = el("div", "tm-cq-hero-top"); top.append(left, action);
   hero.append(top);
  } else {
   hero.append(el("p", "tm-cq-muted", "Sem consultas marcadas. As novas marcações aparecem aqui automaticamente."));
  }
  host.append(hero);
  host.append(formCard(view.form, p.id));

  const stats = el("div", "tm-cq-stats");
  const last = view.history[0];
  const stat = (label, value, sub) => { const s = el("section", "tm-cq-card tm-cq-stat"); s.append(el("p", "tm-cq-muted", label), el("strong", "", value)); if (sub) s.append(el("small", "tm-cq-muted", sub)); return s; };
  const series = (view.assessments || []).filter(a => a.weight_kg || a.fat_pct);
  const lastA = series[series.length - 1], firstA = series[0];
  const fmt = v => String(Math.round(v * 10) / 10).replace(".", ",");
  const diff = (k, u) => lastA && firstA && lastA !== firstA && lastA[k] != null && firstA[k] != null
   ? (lastA[k] - firstA[k] > 0 ? "+" : lastA[k] - firstA[k] < 0 ? "−" : "") + fmt(Math.abs(lastA[k] - firstA[k])) + u + " desde a 1.ª avaliação" : (lastA ? "avaliação de " + dayLabel(lastA.date) : "sem avaliações");
  stats.append(stat("Peso", lastA && lastA.weight_kg != null ? fmt(lastA.weight_kg) + " kg" : "—", diff("weight_kg", " kg")));
  stats.append(stat("Massa gorda", lastA && lastA.fat_pct != null ? fmt(lastA.fat_pct) + " %" : "—", diff("fat_pct", " pontos")));
  const objectives = last && last.objectives && last.objectives.length ? last.objectives.join(" · ") : "—";
  stats.append(stat("Objetivos atuais", objectives, last ? "definidos no último fecho" : ""));
  host.append(stats);

  const path = el("section", "tm-cq-card tm-cq-path");
  const ph = el("div", "tm-cq-section-head"); ph.append(el("h3", "", "Percurso"), el("span", "tm-cq-muted", view.closed + " consultas fechadas"));
  path.append(ph);
  if (!view.history.length) path.append(el("p", "tm-cq-muted", "O percurso aparece aqui à medida que as consultas são fechadas."));
  for (const h of view.history) {
   const row = el("article", "tm-cq-path-item");
   row.append(el("p", "tm-cq-muted", dayLabel(h.date) + " · " + h.professional_name));
   row.append(el("strong", "", h.service_name + " · " + (h.mode === "online" ? "online" : "presencial")));
   if (h.note_text) row.append(el("p", "tm-cq-path-note", h.note_text.length > 260 ? h.note_text.slice(0, 260) + "…" : h.note_text));
   if (h.objectives && h.objectives.length) {
    const tags = el("div", "tm-cq-tags"); for (const o of h.objectives) tags.append(el("span", "tm-cq-pill", o)); row.append(tags);
   }
   path.append(row);
  }
  host.append(path);
 }

 /* ---------- modo consulta ---------- */
 async function startConsultation(kind, bookingId) {
  try {
   const s = await api(`${API}/bookings/${kind}/${encodeURIComponent(bookingId)}/start`, {method: "POST", body: "{}"});
   focus = {...s, step: s.booking.first_visit ? "anamnesis" : "note"};
   renderFocus();
  } catch (e) { feedback(e.message, true); }
 }
 function setSaved(text) { const s = document.querySelector(".tm-cq-focus-saved"); if (s) s.textContent = text; }
 function queueSave(patch) {
  Object.assign(focus.pending || (focus.pending = {}), patch);
  dirty = true; setSaved("Por guardar…");
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
 }
 async function flush() {
  if (!focus || !focus.pending || saving) return;
  const patch = focus.pending; focus.pending = null; saving = true; setSaved("A guardar…");
  try {
   const r = await api(`${API}/sessions/${focus.session.id}`, {method: "PUT", body: JSON.stringify({...patch, version: focus.session.version})});
   focus.session.version = r.version; Object.assign(focus.session, patch);
   dirty = !!focus.pending; setSaved(dirty ? "Por guardar…" : "Guardado");
  } catch (e) {
   setSaved("Não guardado"); feedback(e.message, true);
   if (e.code === "stale_session") { const s = await api(`${API}/bookings/${focus.booking.kind}/${focus.booking.booking_id}`); focus = {...s, step: focus.step}; renderFocus(); }
  } finally { saving = false; if (focus && focus.pending) flush(); }
 }
 function isEmptySession() {
  const s = focus && focus.session;
  if (!s || s.status !== "open" || focus.assessment) return false;
  return !(s.note_text || s.internal_note || s.plan_changes || (s.objectives || []).length ||
   Object.keys(s.indicators || {}).length || s.next_weeks || s.next_action);
 }
 async function discardFocus(ask) {
  if (ask && !confirm("Descartar esta consulta? Apaga o que foi escrito nesta consulta (nota, avaliação e fecho) e a marcação volta ao estado normal.")) return;
  clearTimeout(saveTimer);
  try { await api(`${API}/sessions/${focus.session.id}`, {method: "DELETE"}); if (ask) feedback("Consulta descartada."); }
  catch (e) { feedback(e.message, true); return; }
  dirty = false; closeFocus(true);
 }
 async function closeFocus(skipChecks) {
  if (!skipChecks) {
   if (dirty && !confirm("Há alterações por guardar. Sair mesmo assim?")) return;
   // Abriu só para ver e não escreveu nada: volta ao estado normal sozinha.
   if (!dirty && isEmptySession()) { await discardFocus(false); return; }
  }
  clearTimeout(saveTimer); focus = null; dirty = false;
  $("tm-cq-focus").hidden = true; document.querySelector(".tm-cq-layout").hidden = false;
  loadWorkspace().then(() => openClient && selectClient(openClient)).catch(() => {});
 }
 function renderFocus() {
  const host = $("tm-cq-focus"); host.replaceChildren(); host.hidden = false;
  document.querySelector(".tm-cq-layout").hidden = true;
  const b = focus.booking, s = focus.session, closed = s.status === "closed";
  const bar = el("header", "tm-cq-focus-bar");
  const exit = el("button", "tm-cq-ghost", "← Sair"); exit.type = "button"; exit.addEventListener("click", () => closeFocus(false));
  const who = el("div", "tm-cq-focus-who");
  who.append(el("span", "tm-cq-avatar", initials(b.client_name)));
  const t = el("div"); t.append(el("strong", "", b.client_name + " · " + (b.first_visit ? "primeira consulta" : "seguimento")),
   el("small", "tm-cq-muted", (b.date === (data && data.date) ? "Hoje " : dayLabel(b.date) + " ") + b.start + " · " + (b.mode === "online" ? "online" : "presencial") + " · " + b.professional_name));
  who.append(t);
  bar.append(exit, who, el("span", "tm-cq-focus-saved tm-cq-muted", closed ? "Fechada" : "Guardado"));
  if (!b.first_visit) {
   const see = el("button", "tm-cq-ghost", "Anamnese"); see.type = "button";
   see.title = "Consultar ou completar a anamnese do cliente";
   see.addEventListener("click", () => openAnamnesis(b.client_id, b.client_name, false));
   bar.append(see);
  }
  if (!closed) {
   const drop = el("button", "tm-cq-ghost tm-cq-danger", "Descartar"); drop.type = "button";
   drop.title = "Apaga o que foi escrito nesta consulta e volta ao estado normal";
   drop.addEventListener("click", () => discardFocus(true));
   bar.append(drop);
  }
  host.append(bar);

  const steps = [["note", "Nota", "Indicadores e notas"], ["assessment", "Avaliação", "Medições e cálculos"], ["close", "Fecho", "Plano, objetivos, próxima"]];
  if (b.first_visit) steps.unshift(["anamnesis", "Anamnese", "Formulário e história"]);
  const body = el("div", "tm-cq-focus-body");
  const nav = el("nav", "tm-cq-steps"); nav.setAttribute("aria-label", "Passos da consulta");
  steps.forEach(([key, label, hint], i) => {
   const btn = el("button", "tm-cq-step" + (focus.step === key ? " is-active" : "")); btn.type = "button";
   btn.append(el("span", "tm-cq-step-n", String(i + 1)));
   const c = el("span"); c.append(el("strong", "", label), el("small", "", hint)); btn.append(c);
   btn.addEventListener("click", async () => { await flush(); focus.step = key; renderFocus(); });
   nav.append(btn);
  });
  nav.append(el("p", "tm-cq-steps-hint", "Podes saltar entre passos quando quiseres. Tudo é guardado automaticamente."));
  const content = el("div", "tm-cq-focus-content");
  if (focus.step === "note") renderNote(content, closed);
  else if (focus.step === "close") renderClose(content, closed);
  else if (focus.step === "assessment") renderAssessment(content, closed);
  else if (focus.step === "anamnesis") renderAnamnesisStep(content);
  else renderNote(content, closed);
  body.append(nav, content);
  host.append(body);
 }


 /* ---------- anamnese (formulário ou preenchida pela equipa) ---------- */
 const SKIP_IN_EDITOR = new Set(["check"]);
 function anVisible(item, a) {
  const when = item.when || {}, not = item.when_not || {};
  const match = (ans, v) => Array.isArray(ans) ? ans.includes(v) : ans === v;
  if (!Object.entries(when).every(([k, v]) => match(a[k], v))) return false;
  return Object.entries(not).every(([k, hidden]) => !hidden.some(h => JSON.stringify(a[k] ?? null) === JSON.stringify(h)));
 }
 function anEmpty(v) { return v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length); }
 function shortOpt(label) { const m = /\(([^)]+)\)\s*$/.exec(label); return m && /dia|sem/.test(m[1]) ? m[1] : label; }
 function anamnesisStatus(form) {
  if (!form || !form.has_answers) return el("span", "tm-cq-pill is-pending", "Por preencher");
  if (form.status === "submitted") return el("span", "tm-cq-pill is-positive", "Preenchida pelo cliente · " + dayLabel(new Date(form.submitted_at * 1000).toISOString().slice(0, 10)));
  return el("span", "tm-cq-pill", "Preenchida pela equipa");
 }
 // Editor da anamnese: as mesmas perguntas do formulário, sem obrigatórias; guarda sozinho.
 function anamnesisEditor(host, clientId, steps, initial, onSaved) {
  let a = JSON.parse(JSON.stringify(initial || {}));
  let timer = null;
  const saved = el("span", "tm-cq-muted tm-cq-an-saved", "");
  const save = () => {
   clearTimeout(timer); saved.textContent = "Por guardar…";
   timer = setTimeout(async () => {
    const out = {};
    for (const st of steps) { if (!anVisible(st, a)) continue; for (const f of st.fields) if (anVisible(f, a) && !anEmpty(a[f.id]) && f.type !== "check") out[f.id] = a[f.id]; }
    if (a.consent) out.consent = true;
    for (const k of ["supplements_detail"]) if (a[k]) out[k] = a[k];
    try { const r = await api(`${API}/clients/${encodeURIComponent(clientId)}/anamnesis`, {method: "PUT", body: JSON.stringify({answers: out})}); saved.textContent = "Guardado"; onSaved && onSaved(r.form); }
    catch (e) { saved.textContent = "Não guardado"; feedback(e.message, true); }
   }, 800);
  };
  const set = (id, v, rerender) => { if (anEmpty(v)) delete a[id]; else a[id] = v; save(); if (rerender) draw(); };
  const wrap = el("div", "tm-cq-an");
  const top = el("div", "tm-cq-an-top"); top.append(saved);
  const body = el("div", "tm-cq-an-body");
  wrap.append(top, body);
  function pills(options, value, multi, onPick) {
   const g = el("div", "tm-cq-an-pills");
   for (const [k, lab] of options) {
    const on = multi ? (value || []).includes(k) : value === k;
    const b = el("button", "tm-cq-an-pill" + (on ? " is-on" : ""), shortOpt(lab)); b.type = "button"; b.title = lab;
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => {
     if (!multi) return onPick(on ? "" : k);
     const list = (value || []).filter(x => x !== k); if (!on) list.push(k); onPick(list);
    });
    g.append(b);
   }
   return g;
  }
  function input(type, value, onInput, placeholder) {
   const i = el(type === "textarea" ? "textarea" : "input", type === "textarea" ? "tm-cq-textarea" : "tm-cq-input");
   if (type !== "textarea") i.type = type; else i.rows = 2;
   i.value = value ?? ""; if (placeholder) i.placeholder = placeholder;
   i.addEventListener("input", () => onInput(i.value));
   return i;
  }
  function field(f) {
   const row = el("div", "tm-cq-an-field" + (f.other_of ? " is-other" : ""));
   row.append(el("label", "tm-cq-an-label", f.other_of ? "Outra:" : (f.short || f.label)));
   const v = a[f.id];
   const box = el("div", "tm-cq-an-value");
   if (f.type === "choice" || f.type === "multi") box.append(pills(f.options, v, f.type === "multi", x => set(f.id, x, true)));
   else if (f.type === "text" || f.type === "textarea") box.append(input(f.type, v, x => set(f.id, x.trim() ? x : "")));
   else if (f.type === "date") box.append(input("date", v, x => set(f.id, x)));
   else if (f.type === "number") box.append(input("text", v == null ? "" : String(v).replace(".", ","), x => {
     const n = Number(String(x).replace(",", ".")); if (!x.trim()) set(f.id, ""); else if (Number.isFinite(n) && n >= f.min && n <= f.max) set(f.id, n);
    }, f.unit));
   else if (f.type === "freq") {
    const list = el("div", "tm-cq-an-freq");
    const g = {...(v || {})};
    for (const [k, lab, , opts] of f.rows) {
     const r = el("div", "tm-cq-an-freq-row"); r.append(el("span", "", lab));
     r.append(pills(opts, g[k], false, x => { const n = {...(a[f.id] || {})}; if (x) n[k] = x; else delete n[k]; set(f.id, n, true); }));
     list.append(r);
    }
    box.append(list);
   } else if (f.type === "meals") {
    const meals = {...(v || {})};
    const chosen = f.rows.filter(([k]) => meals[k]).map(([k]) => k);
    box.append(pills(f.rows, chosen, true, list => { const n = {}; for (const k of list) n[k] = meals[k] || {time: "", text: "", qty: "", on: true}; set(f.id, n, true); }));
    for (const [k, lab] of f.rows) {
     if (!meals[k]) continue;
     const m = meals[k]; const r = el("div", "tm-cq-an-meal");
     const up = (part, x) => { const n = {...(a[f.id] || {})}; n[k] = {...(n[k] || {on: true}), [part]: x}; set(f.id, n); };
     r.append(el("strong", "", lab), input("time", m.time, x => up("time", x)), input("text", m.text, x => up("text", x), "O que come"), input("text", m.qty, x => up("qty", x), "Quantidades"));
     box.append(r);
    }
   } else if (f.type === "details") {
    const parent = steps.flatMap(st => st.fields).find(x => x.id === f.of);
    const labels = Object.fromEntries(parent.options);
    for (const key of (a[f.of] || []).filter(k => k !== "none")) {
     const r = el("div", "tm-cq-an-meal");
     const cur = (a[f.id] || {})[key] || {};
     const up = (col, x) => { const n = {...(a[f.id] || {})}; const row2 = {...(n[key] || {})}; if (x.trim()) row2[col] = x; else delete row2[col]; if (Object.keys(row2).length) n[key] = row2; else delete n[key]; set(f.id, n); };
     r.append(el("strong", "", key === "other" ? (a[f.of + "_other"] || "Outro") : labels[key]));
     for (const [col, lab] of f.columns) r.append(input("text", cur[col], x => up(col, x), lab));
     box.append(r);
    }
   }
   row.append(box);
   return row;
  }
  function draw() {
   const y = window.scrollY, active = document.activeElement;
   body.replaceChildren();
   steps.forEach((st, i) => {
    if (!anVisible(st, a)) return;
    const card = el("section", "tm-cq-card tm-cq-an-section");
    const h = el("h3"); h.append(el("span", "tm-cq-muted", String(i + 1) + " "), st.title); card.append(h);
    for (const f of st.fields) if (!SKIP_IN_EDITOR.has(f.type) && anVisible(f, a)) card.append(field(f));
    body.append(card);
   });
   window.scrollTo(0, y);
   if (active && active.isConnected) active.focus({preventScroll: true});
  }
  draw();
  host.append(wrap);
 }
 async function openAnamnesis(clientId, name, startEditing) {
  document.querySelector(".tm-cq-drawer")?.remove();
  let data;
  try { data = await api(`${API}/clients/${encodeURIComponent(clientId)}/anamnesis`); } catch (e) { feedback(e.message, true); return; }
  const drawer = el("aside", "tm-cq-drawer"); drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-label", "Anamnese");
  const head = el("div", "tm-cq-drawer-head");
  const t = el("div"); t.append(el("h2", "", "Anamnese"), el("p", "tm-cq-muted", name || ""));
  const tools = el("div", "tm-cq-form-actions");
  const edit = el("button", "tm-cq-ghost", startEditing ? "Ver resumo" : "Editar"); edit.type = "button";
  const close = el("button", "tm-cq-ghost", "Fechar"); close.type = "button";
  tools.append(edit, close);
  const done = () => { drawer.remove(); document.removeEventListener("keydown", onKey); if (!focus) reloadDetail(clientId); };
  const onKey = e => { if (e.key === "Escape") done(); };
  close.addEventListener("click", done); document.addEventListener("keydown", onKey);
  head.append(t, tools);
  const body = el("div", "tm-cq-drawer-body");
  let editing = !!startEditing, form = data.form;
  const paint = () => {
   body.replaceChildren();
   const status = el("div", "tm-cq-an-status"); status.append(anamnesisStatus(form)); body.append(status);
   if (editing) anamnesisEditor(body, clientId, data.steps, form ? form.answers : {}, f => { form = f; if (focus && focus.booking.client_id === clientId) focus.form = f; });
   else if (form && form.has_answers) formAnswers(body, form);
   else body.append(el("p", "tm-cq-muted", "Ainda sem respostas. Envia o link do formulário ao cliente ou carrega em «Editar» para preencher aqui."));
   edit.textContent = editing ? "Ver resumo" : "Editar";
  };
  edit.addEventListener("click", () => { editing = !editing; paint(); });
  paint();
  drawer.append(head, body);
  document.body.append(drawer);
  close.focus();
 }
 async function reloadDetail(clientId) {
  try { const v = await api(`${API}/clients/${encodeURIComponent(clientId)}`); renderDetail(v); } catch (_) { /* mantém */ }
 }
 async function renderAnamnesisStep(host) {
  const b = focus.booking;
  host.append(el("h2", "", "Anamnese"));
  const info = el("section", "tm-cq-card tm-cq-an-intro");
  const line = el("div", "tm-cq-form-title"); line.append(el("strong", "", "Formulário pré-consulta"), anamnesisStatus(focus.form));
  const copy = el("button", "tm-cq-ghost", focus.form ? "Copiar link" : "Criar e copiar link"); copy.type = "button";
  copy.addEventListener("click", () => copyFormLink(b.client_id, copy));
  const top = el("div", "tm-cq-section-head"); top.append(line, copy);
  info.append(top, el("p", "tm-cq-muted", focus.form && focus.form.status === "submitted"
   ? "Respostas do cliente. Completa ou corrige o que for preciso; fica registado que foi a equipa."
   : "O cliente ainda não enviou o formulário. Podes preencher a anamnese aqui durante a consulta."));
  host.append(info);
  const slot = el("div"); host.append(slot);
  try {
   const data = await api(`${API}/clients/${encodeURIComponent(b.client_id)}/anamnesis`);
   anamnesisEditor(slot, b.client_id, data.steps, data.form ? data.form.answers : {}, f => { focus.form = f; });
  } catch (e) { slot.append(el("p", "tm-cq-empty", e.message)); }
  host.append(nextButton("Seguir para a nota →", "note"));
 }

 /* ---------- formulário pré-consulta ---------- */
 function formStatus(form) {
  if (!form) return el("span", "tm-cq-pill", "Link ainda não criado");
  if (form.status === "submitted") return el("span", "tm-cq-pill is-positive", "Recebido " + dayLabel(new Date(form.submitted_at * 1000).toISOString().slice(0, 10)));
  return el("span", "tm-cq-pill is-pending", "Por preencher");
 }
 async function copyFormLink(clientId, button) {
  try {
   const r = await api(`${API}/clients/${encodeURIComponent(clientId)}/form`, {method: "POST", body: "{}"});
   let copied = false;
   try { await navigator.clipboard.writeText(r.form.link); copied = true; } catch (_) { /* sem permissão */ }
   if (copied) feedback("Link do formulário copiado. Envia-o ao cliente por email ou WhatsApp.");
   else window.prompt("Copia o link do formulário:", r.form.link);
   if (focus && focus.booking && focus.booking.client_id === clientId) focus.form = r.form;
   return r.form;
  } catch (e) { feedback(e.message, true); }
 }
 // «A ter em conta» na consulta: o essencial da anamnese para ter à vista.
 function careItems(form) {
  if (!form || !form.summary) return [];
  const pick = {"Objetivos": ["Objetivos", "Motivação para mudar"],
   "Saúde": ["Patologias", "Medicação", "Alergias", "Intolerâncias", "Fuma", "Sono"],
   "Saúde feminina": ["Ciclo", "Pílula", "Sintomas no período"],
   "Treino": ["Atividade", "Desportos"],
   "Alimentação": ["Padrão alimentar", "Não gosta de"],
   "Suplementação": ["Suplementos"], "Notas do cliente": ["Notas"]};
  const out = [];
  for (const g of form.summary) for (const it of g.items) if ((pick[g.title] || []).includes(it.label))
   out.push({label: it.label === "Notas" ? "Notas do cliente" : it.label, value: it.value});
  return out;
 }
 function formCard(form, clientId) {
  const card = el("section", "tm-cq-card tm-cq-form-card");
  const head = el("div", "tm-cq-section-head");
  const title = el("div", "tm-cq-form-title"); title.append(el("h3", "", "Anamnese"), anamnesisStatus(form));
  const copy = el("button", "tm-cq-ghost", form ? "Copiar link do formulário" : "Criar link do formulário"); copy.type = "button";
  copy.addEventListener("click", async () => { if (await copyFormLink(clientId, copy)) reloadDetail(clientId); });
  const name = (document.querySelector(".tm-cq-person h2") || {}).textContent || "";
  const see = el("button", "tm-cq-ghost", form && form.has_answers ? "Ver" : "Preencher"); see.type = "button";
  see.addEventListener("click", () => openAnamnesis(clientId, name, !(form && form.has_answers)));
  const actions = el("div", "tm-cq-form-actions"); actions.append(copy, see);
  head.append(title, actions); card.append(head);
  if (form && form.summary && form.summary.length) {
   const grid = el("div", "tm-cq-an-summary");
   for (const g of form.summary) {
    const col = el("section", "tm-cq-an-group"); col.append(el("h4", "", g.title));
    for (const it of g.items) { const r = el("p", "tm-cq-care"); r.append(el("span", "tm-cq-muted", it.label), el("span", "", it.value)); col.append(r); }
    grid.append(col);
   }
   card.append(grid);
  } else card.append(el("p", "tm-cq-muted", "Envia o link do formulário ao cliente ou preenche a anamnese aqui."));
  return card;
 }
 function formAnswers(host, form) {
  if (form.care && form.care.length) {
   const care = el("section", "tm-cq-card tm-cq-form-care");
   care.append(el("h3", "", "A ter em conta"));
   for (const item of form.care) { const r = el("p", "tm-cq-care"); r.append(el("span", "tm-cq-muted", item.label), el("strong", "", item.value)); care.append(r); }
   host.append(care);
  }
  const grid = el("div", "tm-cq-form-grid");
  (form.sections || []).forEach((sec, i) => {
   const card = el("section", "tm-cq-card");
   const h = el("h3"); h.append(el("span", "tm-cq-muted", String(i + 1) + " "), sec.title); card.append(h);
   const before = card.childElementCount;
   for (const row of sec.rows) {
    if (row.type === "text") {
     const r = el("div", "tm-cq-kv"); const val = el("span", "", row.value);
     if (row.team) { val.append(" ", el("small", "tm-cq-team", "equipa")); }
     r.append(el("span", "tm-cq-muted", row.label), val); card.append(r);
    } else if (row.type === "meals") {
     if (!row.items.length) continue;
     const tl = el("div", "tm-cq-meals");
     for (const m of row.items) {
      const r = el("div", "tm-cq-meal"); r.append(el("span", "tm-cq-muted", m.time || "—"));
      const c = el("div"); c.append(el("strong", "", m.label), el("p", "", m.text || ""));
      if (m.qty) c.append(el("p", "tm-cq-muted", m.qty));
      r.append(c); tl.append(r);
     }
     card.append(tl);
    }
   }
   if (card.childElementCount === before) card.append(el("p", "tm-cq-muted", "Sem respostas."));
   grid.append(card);
  });
  host.append(grid);
 }


 function renderSoon(host, title, text) {
  host.append(el("p", "tm-cq-muted", "Passo"), el("h2", "", title));
  const card = el("section", "tm-cq-card"); card.append(el("p", "tm-cq-muted", text)); host.append(card);
 }
 function renderNote(host, closed) {
  const s = focus.session, prev = focus.previous;
  host.append(el("h2", "", "Nota"));
  const grid = el("div", "tm-cq-note-grid");
  const main = el("div", "tm-cq-stack");
  const card = el("section", "tm-cq-card");
  const ch = el("div", "tm-cq-section-head"); ch.append(el("h3", "", "Como correu desde a última consulta"), el("span", "tm-cq-muted", "só a equipa vê"));
  const area = el("textarea", "tm-cq-textarea"); area.rows = 7; area.value = s.note_text || ""; area.disabled = closed;
  area.placeholder = "Adesão ao plano, treinos, sono, sintomas, o que mudou…";
  area.addEventListener("input", () => queueSave({note_text: area.value}));
  card.append(ch, area); main.append(card);

  const ind = el("section", "tm-cq-card");
  const ih = el("div", "tm-cq-section-head"); ih.append(el("h3", "", "Indicadores"), el("span", "tm-cq-muted", "1 mau · 5 ótimo · o contorno mostra o valor anterior"));
  ind.append(ih);
  const values = {...(s.indicators || {})}, before = (prev && prev.indicators) || {};
  for (const [key, label] of INDICATORS) {
   const row = el("div", "tm-cq-ind");
   row.append(el("span", "", label));
   const scale = el("div", "tm-cq-scale"); scale.setAttribute("role", "radiogroup"); scale.setAttribute("aria-label", label);
   for (let v = 1; v <= 5; v++) {
    const b = el("button", "tm-cq-scale-btn" + (values[key] === v ? " is-on" : "") + (before[key] === v ? " is-prev" : ""), String(v));
    b.type = "button"; b.disabled = closed; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(values[key] === v));
    b.addEventListener("click", () => {
     values[key] = values[key] === v ? null : v;
     for (const x of scale.children) { const on = Number(x.textContent) === values[key]; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); }
     trend.textContent = trendText(values[key], before[key]);
     queueSave({indicators: Object.fromEntries(Object.entries(values).filter(([, x]) => x))});
    });
    scale.append(b);
   }
   const trend = el("span", "tm-cq-trend", trendText(values[key], before[key]));
   row.append(scale, trend); ind.append(row);
  }
  main.append(ind);

  const aside = el("aside", "tm-cq-stack");
  const care = el("section", "tm-cq-card tm-cq-aside");
  care.append(el("h3", "", "A ter em conta"));
  const notes = (focus.profile_notes || "").trim();
  const fromForm = careItems(focus.form);
  for (const item of fromForm) { const r = el("p", "tm-cq-care"); r.append(el("span", "tm-cq-muted", item.label), el("strong", "", item.value)); care.append(r); }
  if (notes) { const r = el("p", "tm-cq-care"); r.append(el("span", "tm-cq-muted", "Notas do perfil"), el("strong", "", notes)); care.append(r); }
  if (!fromForm.length && !notes) care.append(el("p", "tm-cq-muted", "Ainda sem anamnese. O que for preenchido (pelo cliente ou pela equipa) aparece aqui."));
  aside.append(care);
  if (prev && prev.objectives && prev.objectives.length) {
   const o = el("section", "tm-cq-card tm-cq-aside"); o.append(el("h3", "", "Objetivos da consulta anterior"));
   for (const x of prev.objectives) o.append(el("p", "tm-cq-check", x));
   aside.append(o);
  }
  if (prev && prev.internal_note) {
   const n = el("section", "tm-cq-card tm-cq-aside"); n.append(el("p", "tm-cq-muted", "Nota interna da última consulta"), el("p", "", "“" + prev.internal_note + "”"));
   aside.append(n);
  }
  grid.append(main, aside); host.append(grid);
  host.append(nextButton("Seguir para a avaliação →", "assessment"));
 }
 function trendText(now, before) {
  if (!now || !before) return before ? "antes " + before : "";
  return now > before ? "↑ de " + before : now < before ? "↓ de " + before : "= " + before;
 }
 function nextButton(label, step) {
  const wrap = el("div", "tm-cq-actions");
  const b = el("button", "tm-cq-primary", label); b.type = "button";
  b.addEventListener("click", async () => { await flush(); focus.step = step; renderFocus(); });
  wrap.append(b); return wrap;
 }
 function renderClose(host, closed) {
  const s = focus.session;
  host.append(el("h2", "", "Fecho"));
  const grid = el("div", "tm-cq-note-grid");
  const main = el("div", "tm-cq-stack"), side = el("div", "tm-cq-stack");
  const plan = el("section", "tm-cq-card");
  const ph = el("div", "tm-cq-section-head"); ph.append(el("h3", "", "Alterações ao plano"), el("span", "tm-cq-muted", "só a equipa"));
  const pa = el("textarea", "tm-cq-textarea"); pa.rows = 4; pa.value = s.plan_changes || ""; pa.disabled = closed;
  pa.placeholder = "O que muda no plano alimentar e porquê.";
  pa.addEventListener("input", () => queueSave({plan_changes: pa.value}));
  plan.append(ph, pa); main.append(plan);

  const obj = el("section", "tm-cq-card");
  const oh = el("div", "tm-cq-section-head"); oh.append(el("h3", "", "Objetivos para o cliente"), el("span", "tm-cq-muted", "até 10"));
  obj.append(oh);
  const items = [...(s.objectives || [])];
  const list = el("div", "tm-cq-stack tm-cq-objectives");
  const draw = () => {
   list.replaceChildren();
   items.forEach((text, i) => {
    const row = el("div", "tm-cq-objective");
    const input = el("input", "tm-cq-input"); input.value = text; input.maxLength = 200; input.disabled = closed;
    input.addEventListener("input", () => { items[i] = input.value; queueSave({objectives: items.filter(Boolean)}); });
    const rm = el("button", "tm-cq-icon-btn", "×"); rm.type = "button"; rm.disabled = closed; rm.setAttribute("aria-label", "Remover objetivo");
    rm.addEventListener("click", () => { items.splice(i, 1); draw(); queueSave({objectives: items.filter(Boolean)}); });
    row.append(input, rm); list.append(row);
   });
  };
  draw();
  const add = el("button", "tm-cq-ghost", "+ Adicionar objetivo"); add.type = "button"; add.disabled = closed;
  add.addEventListener("click", () => { if (items.length >= 10) return; items.push(""); draw(); list.lastElementChild?.querySelector("input")?.focus(); });
  obj.append(list, add); main.append(obj);

  const next = el("section", "tm-cq-card");
  next.append(el("h3", "", "Próxima consulta"));
  const seg = el("div", "tm-cq-segment is-inline");
  for (const w of [2, 4, 6, 8]) {
   const b = el("button", "", w + " sem."); b.type = "button"; b.disabled = closed;
   b.setAttribute("aria-selected", String(s.next_weeks === w));
   b.addEventListener("click", () => { s.next_weeks = w; weekOffset = 0; for (const x of seg.children) x.setAttribute("aria-selected", String(x === b)); queueSave({next_weeks: w}); drawPlanner(); });
   seg.append(b);
  }
  const how = el("div", "tm-cq-choices");
  for (const [value, title, hint] of [["link", "Enviar link para marcar", "A cliente escolhe o dia e paga no site"], ["book", "Marcar já", "Escolher o dia e a hora agora"]]) {
   const b = el("button", "tm-cq-choice" + (s.next_action === value ? " is-on" : "")); b.type = "button"; b.disabled = closed;
   b.append(el("strong", "", title), el("small", "", hint));
   b.addEventListener("click", () => { s.next_action = value; for (const x of how.children) x.classList.toggle("is-on", x === b); queueSave({next_action: value}); drawPlanner(); });
   how.append(b);
  }
  const planner = el("div", "tm-cq-planner");
  next.append(el("p", "tm-cq-muted", "Daqui a"), seg, how, planner);
  side.append(next);
  // «Marcar já»: vagas reais da nutricionista na semana sugerida; escolhe-se dia e hora aqui.
  let weekOffset = 0;
  async function drawPlanner() {
   planner.replaceChildren();
   if (s.next_action !== "book" || closed) return;
   const b = focus.booking, contact = focus.contact || {};
   const service = focus.followup_service_id || b.service_id;
   const base = new Date(b.date + "T12:00:00");
   base.setDate(base.getDate() + 7 * (s.next_weeks || 4) + 7 * weekOffset);
   const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
   const days = [...Array(6)].map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().slice(0, 10); });
   const head = el("div", "tm-cq-planner-head");
   const prevW = el("button", "tm-cq-ghost", "‹"); prevW.type = "button"; prevW.title = "Semana anterior";
   const nextW = el("button", "tm-cq-ghost", "›"); nextW.type = "button"; nextW.title = "Semana seguinte";
   prevW.addEventListener("click", () => { weekOffset--; drawPlanner(); });
   nextW.addEventListener("click", () => { weekOffset++; drawPlanner(); });
   head.append(prevW, el("strong", "", "Semana de " + dayLabel(days[0])), nextW);
   planner.append(head, el("p", "tm-cq-muted", b.professional_name + " · " + (b.mode === "online" ? "online" : "presencial")));
   const grid = el("div", "tm-cq-planner-days"); planner.append(grid);
   const results = await Promise.all(days.map(d => api(`/api/v2/admin/appointments/slots-preview?professional_id=${encodeURIComponent(b.professional_id)}&service_id=${encodeURIComponent(service)}&mode=${b.mode}&date=${d}`).catch(() => ({slots: []}))));
   let any = false;
   days.forEach((d, i) => {
    const slots = results[i].slots || [];
    const col = el("div", "tm-cq-planner-day"); col.append(el("strong", "", dayLabel(d)));
    if (!slots.length) col.append(el("small", "tm-cq-muted", "sem vagas"));
    for (const sl of slots) {
     any = true;
     const t = el("button", "tm-cq-slot", sl.start); t.type = "button";
     t.addEventListener("click", async () => {
      if (!confirm(`Marcar ${b.client_name} a ${dayLabel(d)} às ${sl.start} com ${b.professional_name}?`)) return;
      try {
       const created = await api("/api/v2/admin/appointments/bookings", {method: "POST", body: JSON.stringify({
        professional_id: b.professional_id, service_id: service, mode: b.mode, date: d, start: sl.start,
        customer_name: contact.name || b.client_name, customer_email: contact.email || "", customer_phone: contact.phone || ""})});
       await api("/api/v2/admin/consult-clients/link", {method: "POST", body: JSON.stringify({kind: "manual", booking_id: created.id, client_id: b.client_id})}).catch(() => {});
       planner.replaceChildren(el("p", "tm-cq-planner-done", "Marcada: " + dayLabel(d) + " às " + sl.start + " com " + b.professional_name + "."));
       feedback("Próxima consulta marcada.");
      } catch (e) { feedback(e.message, true); drawPlanner(); }
     });
     col.append(t);
    }
    grid.append(col);
   });
   if (!any) planner.append(el("p", "tm-cq-muted", "Sem vagas nesta semana. Usa as setas para ver outras semanas."));
  }
  drawPlanner();

  const internal = el("section", "tm-cq-card");
  const ih = el("div", "tm-cq-section-head"); ih.append(el("h3", "", "Nota interna para a próxima"), el("span", "tm-cq-muted", "só a equipa"));
  const ia = el("textarea", "tm-cq-textarea"); ia.rows = 3; ia.value = s.internal_note || ""; ia.disabled = closed;
  ia.placeholder = "Ex.: ver como correu o lanche pré-treino";
  ia.addEventListener("input", () => queueSave({internal_note: ia.value}));
  internal.append(ih, ia); side.append(internal);
  grid.append(main, side); host.append(grid);

  const actions = el("div", "tm-cq-actions");
  if (closed) actions.append(el("p", "tm-cq-muted", "Consulta fechada. Fica só de leitura."));
  else {
   actions.append(el("p", "tm-cq-muted", "Ao fechar, o registo fica bloqueado."));
   const b = el("button", "tm-cq-primary", "Fechar consulta"); b.type = "button";
   b.addEventListener("click", async () => {
    if (!confirm("Fechar esta consulta? Depois fica só de leitura.")) return;
    await flush();
    try {
     const r = await api(`${API}/sessions/${s.id}/close`, {method: "POST", body: JSON.stringify({version: s.version})});
     s.version = r.version; s.status = "closed"; dirty = false; feedback("Consulta fechada.");
     closeFocus(true);
    } catch (e) { feedback(e.message, true); }
   });
   actions.append(b);
  }
  host.append(actions);
 }


 /* ---------- Avaliação ---------- */
 // Bonecos iguais aos da app dos jogadores (Progresso), desenhados a partir de metade e espelhados.
 const BODY_FIGURES={
 M:{
  half:"M80 8 C71 8 64.5 15 64.5 26 C64.5 36 68 43 71 46 L71 51 C64 55 52 57 44 59 C38 61 35 66 34 74 C32 84 30 92 29 100 C27 110 26 116 26 120 C25 136 23 152 22.5 164 C21 172 21 182 23 188 C25 193 30 193 32 190 C33 186 33 176 33 170 C34 164 35 160 36 156 C38 140 40 128 42 118 C44 108 46 96 48 87 L50 86 C51 104 53 120 52.6 134 C52 146 50 154 50 162 C50 180 51 196 52 208 C53 222 55 234 56 244 C55 252 53 260 53 268 C53 284 56 296 58.5 308 C57 314 52 320 53 324 C55 328 66 328 70 325 C71 318 70 312 69.6 308 C70 296 74 280 75 268 C75 258 73 250 73 242 C74 222 77 196 80 180",
  extra:'<ellipse cx="64.5" cy="28" rx="2.6" ry="5"/><ellipse cx="95.5" cy="28" rx="2.6" ry="5"/>',hair:"",
  front:"M63 59 Q70 56 77 59 M57 98 Q63 101 69 98 M33 116 L40 118",navel:[80,146],
  back:"M61 74 Q56 90 63 99 M33 116 L40 118",spine:"M80 98 L80 142",
  frontWear:"M50 155 Q80 151 110 155 L109.5 192 L84 196 L80 184 L76 196 L50.5 192 Z",
  backWear:"M50 155 Q80 151 110 155 L109.5 192 Q96 198 80 194 Q64 198 50.5 192 Z",straps:"",
  sites:{biceps:[39,100],abdominal_skin:[91,145],suprailiac:[55,138],supraspinal:[63,151],thigh_skin:[65,215],calf_skin:[72,268],triceps:[311,100],back:[284,108]},
  tapes:{arm_right_relaxed:[29,48,102],chest:[49,111,92],waist:[53,107,125],abdominal_perimeter:[51,109,146],thigh_right:[52,79,205],thigh_left:[81,108,205],calf_right:[53,75,268],calf_left:[85,107,268]}
 },
 F:{
  half:"M80 12 C72 12 67 19 67 30 C67 40 70 46 73 50 L71 56 C66 60 56 62 48 64 C43 66 41 70 40 76 C39 84 38 90 37 97 C36 108 35.5 118 35.3 126 C34.5 140 34 154 33.5 166 C32 174 32 182 34 188 C36 192 41 192 42 189 C43 184 43 176 42 170 C43 165 45 162 46 159 C48 146 49 134 50 124 C51 108 52 94 53.6 84 L55 82 C56 98 57 112 56 122 C55 134 50 146 48 158 C47 172 49 186 51 199 C53 214 56 226 57 236 C56 246 55 256 56.6 265 C57.5 280 61 292 62.8 302 C61 310 56 318 56 322 C57 326 68 327 72 324 C73 316 72 308 72.7 302 C74 290 77 276 76.7 265 C76.5 254 75 244 75.6 236 C76 216 78 192 80 174",
  extra:"",hair:"M80 6 C66 6 58 15 58 30 C58 42 56 50 52 55 C57 58 64 58 70 55 L80 55 Z",
  front:"M66 63 Q70 62 74 64 M63 236 Q67 241 72 237",navel:[80,146],
  back:"M63 238 Q67 235 72 238",spine:"M80 108 L80 150",
  frontWear:"M56 84 Q80 80 104 84 L104.5 104 Q92 109 80 103 Q68 109 55.5 104 Z M49 158 Q80 155 111 158 L111 174 Q96 178 84 188 L76 188 Q64 178 49 174 Z",
  backWear:"M56 92 L104 92 L104 104 L56 104 Z M49 158 Q80 155 111 158 L111 180 Q96 188 80 186 Q64 188 49 180 Z",straps:"M64 66 L64 92 M96 66 L96 92",
  sites:{biceps:[44.5,100],abdominal_skin:[91,145],suprailiac:[53,136],supraspinal:[61,150],thigh_skin:[64,210],calf_skin:[72,265],triceps:[305.5,100],back:[284,114]},
  tapes:{arm_right_relaxed:[37,53.6,102],chest:[54,106,92],waist:[56,104,122],abdominal_perimeter:[50,110,146],thigh_right:[51,79,200],thigh_left:[81,109,200],calf_right:[56.6,76.7,265],calf_left:[83.3,103.4,265]}
 }
};

 const SKIN_SITE = {subscapular:"back", triceps:"triceps", biceps:"biceps", suprailiac:"suprailiac", supraspinal:"supraspinal", abdominal:"abdominal_skin", thigh:"thigh_skin", calf:"calf_skin"};
 const TAPE_SITE = {arm_relaxed:"arm_right_relaxed", chest:"chest", waist:"waist", abdominal_girth:"abdominal_perimeter", thigh_mid:"thigh_right", thigh_mid_left:"thigh_left", calf_girth:"calf_right", calf_girth_left:"calf_left"};
 const FIELDS = {
  basics: [["weight_kg","Peso","kg"],["height_cm","Altura","cm"]],
  skinfolds: [["subscapular","Costas (subescapular)","mm"],["triceps","Tricipital","mm"],["biceps","Bicipital","mm"],["suprailiac","Suprailíaca","mm"],
   ["supraspinal","Supraespinal","mm"],["abdominal","Abdominal","mm"],["thigh","Coxa (crural)","mm"],["calf","Gémeo (geminal)","mm"]],
  girths: [["arm_relaxed","Braço direito relaxado","cm"],["arm_flexed","Braço direito contraído","cm"],["chest","Peitoral","cm"],["waist","Cintura","cm"],
   ["abdominal_girth","Abdominal","cm"],["hip","Glúteo","cm"],["thigh_mid","Coxa direita (média)","cm"],["thigh_mid_left","Coxa esquerda (média)","cm"],
   ["calf_girth","Gémeo direito","cm"],["calf_girth_left","Gémeo esquerdo","cm"]],
 };
 const SVGNS = "http://www.w3.org/2000/svg";
 const num = v => v == null || v === "" ? "" : String(Math.round(v * 10) / 10).replace(".", ",");
 function bodyShape(fig, offset, back) {
  const mirror = inner => inner + '<g transform="matrix(-1 0 0 1 160 0)">' + inner + '</g>';
  const [nx, ny] = fig.navel;
  return '<g transform="translate(' + offset + ',0)">'
   + '<g class="tm-cq-body-fill">' + mirror('<path fill-rule="evenodd" d="' + fig.half + ' Z"/>') + (fig.hair ? mirror('<path d="' + fig.hair + '"/>') : "") + fig.extra + '</g>'
   + '<g class="tm-cq-body-detail">' + mirror('<path d="' + (back ? fig.back : fig.front) + '"/>') + (back ? '<path d="' + fig.spine + '"/>' : '<ellipse cx="' + nx + '" cy="' + ny + '" rx="1.4" ry="1.9"/>') + '</g>'
   + '<path class="tm-cq-body-wear" d="' + (back ? fig.backWear : fig.frontWear) + '"/>'
   + (back && fig.straps ? '<path class="tm-cq-body-straps" d="' + fig.straps + '"/>' : "") + '</g>';
 }
 function svgEl(tag, attrs, text) { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; }
 function skinfoldMap(fig, m) {
  const svg = svgEl("svg", {viewBox: "0 0 360 352", class: "tm-cq-body-map", role: "img", "aria-label": "Pregas no corpo"});
  svg.innerHTML = bodyShape(fig, 0, false) + bodyShape(fig, 190, true);
  for (const [key, site] of Object.entries(SKIN_SITE)) {
   const [x, y] = fig.sites[site], v = m[key];
   if (!v) { svg.append(svgEl("circle", {cx: x, cy: y, r: 2.5, class: "tm-cq-body-empty"})); continue; }
   const dot = svgEl("circle", {cx: x, cy: y, r: Math.max(3.5, Math.min(9, 2.5 + v * 0.45)), class: "tm-cq-body-dot"});
   dot.append(svgEl("title", {}, num(v) + " mm")); svg.append(dot);
  }
  svg.append(svgEl("text", {x: 80, y: 348, "text-anchor": "middle", class: "tm-cq-body-caption"}, "Frente"));
  svg.append(svgEl("text", {x: 270, y: 348, "text-anchor": "middle", class: "tm-cq-body-caption"}, "Costas"));
  return svg;
 }
 function perimeterMap(fig, m) {
  const svg = svgEl("svg", {viewBox: "0 0 360 335", class: "tm-cq-body-map", role: "img", "aria-label": "Perímetros no corpo"});
  const g = svgEl("g", {transform: "translate(100,0)"}); g.innerHTML = bodyShape(fig, 0, false); svg.append(g);
  const left = ["arm_relaxed", "thigh_mid", "calf_girth"], trunk = ["chest", "waist", "abdominal_girth"];
  for (const [key, site] of Object.entries(TAPE_SITE)) {
   const v = m[key]; if (!v) continue;
   const [x1, x2, y] = fig.tapes[site];
   g.append(svgEl("path", {d: "M" + x1 + " " + y + " Q" + ((x1 + x2) / 2) + " " + (y + 3.5) + " " + x2 + " " + y, class: "tm-cq-tape"}));
   const isLeft = left.includes(key), isTrunk = trunk.includes(key);
   const tx = isLeft ? (key === "arm_relaxed" ? 100 + x1 - 6 : 100 + Math.min(x1, 52) - 8) : (isTrunk ? 238 : 100 + x2 + 8);
   if (isTrunk) svg.append(svgEl("path", {d: "M" + (100 + x2 + 2) + " " + y + " L" + (tx - 4) + " " + y, class: "tm-cq-tape-lead"}));
   svg.append(svgEl("text", {x: tx, y: y + 4, "text-anchor": isLeft ? "end" : "start", class: "tm-cq-tape-value"}, num(v)));
  }
  return svg;
 }
 function renderAssessment(host, closed) {
  const a = focus.assessment, prev = focus.previous_assessment, client = focus.client || {};
  const m = {...((a && a.measures) || {})};
  if (!m.height_cm && client.height_cm) m.height_cm = client.height_cm;
  let equation = (a && a.equation) || "peterson", version = a ? a.version : null, timer = null, busy = false, queued = false;
  const before = (prev && prev.measures) || {};
  const head = el("div", "tm-cq-section-head");
  head.append(el("h2", "", "Avaliação"));
  const eqWrap = el("label", "tm-cq-eq"); eqWrap.append(el("span", "tm-cq-muted", "Equação"));
  const eqSel = el("select", "tm-cq-select"); eqSel.disabled = closed;
  for (const e of focus.equations || []) { const o = el("option", "", e.label); o.value = e.key; eqSel.append(o); }
  eqSel.value = equation; eqWrap.append(eqSel); head.append(eqWrap);
  host.append(head);
  const notice = el("p", "tm-cq-notice"); host.append(notice);
  // Pontos médios do braço e da coxa: medem-se uma vez, na 1.ª avaliação; depois ficam como dados.
  let points = null;
  const pts = el("section", "tm-cq-card tm-cq-points");
  function drawPoints(editing) {
   pts.replaceChildren();
   const have = client.arm_point_cm && client.thigh_point_cm;
   const ph = el("div", "tm-cq-section-head");
   ph.append(el("h3", "", "Pontos de medição"), el("span", "tm-cq-muted", have && !editing ? "medidos uma vez · usados em todas as avaliações" : "medem-se na 1.ª avaliação"));
   pts.append(ph);
   if (have && !editing) {
    const row = el("div", "tm-cq-points-row");
    row.append(el("span", "", "Braço: ponto médio a " + num(client.arm_point_cm) + " cm"), el("span", "", "Coxa: ponto médio a " + num(client.thigh_point_cm) + " cm"));
    if (!closed) { const ed = el("button", "tm-cq-ghost", "Alterar"); ed.type = "button"; ed.addEventListener("click", () => drawPoints(true)); row.append(ed); }
    pts.append(row); return;
   }
   const row = el("div", "tm-cq-points-row is-edit");
   for (const [key, label] of [["arm_point_cm", "Distância acrómio–olecrânio"], ["thigh_point_cm", "Distância da coxa (prega inguinal–rótula)"]]) {
    const box = el("label", "tm-cq-point");
    box.append(el("span", "tm-cq-muted", label));
    const input = el("input", "tm-cq-num"); input.type = "text"; input.inputMode = "decimal"; input.disabled = closed;
    if (client[key]) input.value = num(client[key] * 2);
    const out = el("strong", "", client[key] ? "Ponto médio: " + num(client[key]) + " cm" : "Ponto médio: —");
    input.addEventListener("input", () => {
     const v = Number(input.value.replace(",", ".").trim());
     if (!input.value.trim() || !Number.isFinite(v) || v <= 0) { out.textContent = "Ponto médio: —"; return; }
     const mid = Math.round(v / 2 * 10) / 10;
     out.textContent = "Ponto médio: " + num(mid) + " cm";
     client[key] = mid; points = {...(points || {}), [key]: mid}; schedule();
    });
    const line = el("div", "tm-cq-point-line"); line.append(input, el("span", "tm-cq-muted", "cm"));
    box.append(line, out);
    row.append(box);
   }
   pts.append(row);
  }
  drawPoints(false);
  host.append(pts);
  const grid = el("div", "tm-cq-assess-grid");
  const reg = el("section", "tm-cq-card tm-cq-register");
  reg.append(el("h3", "", "Registo"));
  for (const [group, title] of [["basics", "Básicos"], ["skinfolds", "Pregas"], ["girths", "Perímetros"]]) {
   const gh = el("div", "tm-cq-reg-head"); gh.append(el("strong", "", title), el("span", "tm-cq-muted", prev ? "última · " + dayLabel(prev.assessed_on) : "última"));
   reg.append(gh);
   for (const [key, label, unit] of FIELDS[group]) {
    const row = el("label", "tm-cq-reg-row");
    row.append(el("span", "", label));
    const input = el("input", "tm-cq-num"); input.type = "text"; input.inputMode = "decimal"; input.disabled = closed;
    input.value = num(m[key]); input.setAttribute("aria-label", label + " (" + unit + ")");
    input.addEventListener("input", () => {
     const raw = input.value.replace(",", ".").trim();
     const v = raw === "" ? null : Number(raw);
     input.classList.toggle("is-invalid", raw !== "" && !Number.isFinite(v));
     if (raw === "") delete m[key]; else if (Number.isFinite(v)) m[key] = v; else return;
     drawVisuals(); schedule();
    });
    row.append(input, el("span", "tm-cq-muted tm-cq-unit", unit), el("span", "tm-cq-muted tm-cq-last", num(before[key])));
    reg.append(row);
   }
  }
  const side = el("div", "tm-cq-stack");
  const pregas = el("section", "tm-cq-card"), perim = el("section", "tm-cq-card");
  const results = el("div", "tm-cq-results");
  side.append(pregas, perim, results);
  grid.append(reg, side); host.append(grid);
  const fig = BODY_FIGURES[client.sex === "F" ? "F" : "M"];
  function drawVisuals() {
   const sum = FIELDS.skinfolds.every(([k]) => m[k]) ? FIELDS.skinfolds.reduce((t, [k]) => t + m[k], 0) : null;
   const prevSum = FIELDS.skinfolds.every(([k]) => before[k]) ? FIELDS.skinfolds.reduce((t, [k]) => t + before[k], 0) : null;
   pregas.replaceChildren(); const ph = el("div", "tm-cq-section-head"); ph.append(el("h3", "", "Pregas"), el("span", "tm-cq-muted", "como o cliente vê"));
   const foot = el("div", "tm-cq-sum"); foot.append(el("strong", "", "Soma de 8 pregas"), el("span", "", sum ? num(sum) + " mm" : "—"));
   if (sum && prevSum) foot.append(el("small", sum <= prevSum ? "is-good" : "is-up", (sum <= prevSum ? "−" : "+") + num(Math.abs(sum - prevSum))));
   pregas.append(ph, skinfoldMap(fig, m), foot);
   perim.replaceChildren(); const qh = el("div", "tm-cq-section-head"); qh.append(el("h3", "", "Perímetros")); perim.append(qh, perimeterMap(fig, m));
  }
  function drawResults(r) {
   results.replaceChildren();
   const missing = (r && r.missing) || [];
   const names = {sex: "sexo", birth_date: "data de nascimento", height_cm: "altura"};
   notice.textContent = missing.length ? "Para os cálculos faltam no perfil: " + missing.map(x => names[x] || x).join(", ") + "." : "";
   const prevR = (prev && prev.results) || {};
   // Como na página 2 dos relatórios: valor atual, anterior e variação em %.
   const card = (label, value, unit, before, sub) => {
    const c = el("section", "tm-cq-card tm-cq-result"); c.append(el("p", "tm-cq-muted", label));
    const v = el("strong", "", value == null ? "—" : num(value)); if (value != null && unit) v.append(el("small", "", " " + unit)); c.append(v);
    if (before != null && value != null) {
     const pct = before ? Math.round((value - before) / before * 100) : 0;
     c.append(el("small", "tm-cq-delta", "antes " + num(before) + (unit ? " " + unit : "") + " · " + (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%"));
    }
    if (sub) c.append(el("small", "tm-cq-muted", sub));
    return c;
   };
   const cur = k => r ? (k.startsWith("c.") ? (r.corrected || {})[k.slice(2)] : r[k]) ?? null : null;
   const old = k => (k.startsWith("c.") ? (prevR.corrected || {})[k.slice(2)] : prevR[k]) ?? null;
   const weight = m.weight_kg ?? null, weightBefore = before.weight_kg ?? null;
   results.append(
    card("Peso corporal", weight, "kg", weightBefore, ""),
    card("Gordura corporal", cur("fat_pct"), "%", old("fat_pct"), r && r.fat_kg != null ? num(r.fat_kg) + " kg" : ""),
    card("IMC", cur("bmi"), "", old("bmi"), ""),
    card("Massa muscular", cur("muscle_kg"), "kg", old("muscle_kg"), "Lee"),
    card("Índice de massa muscular", cur("smi"), "kg/m²", old("smi"), ""),
    card("Músculo do braço", cur("c.arm"), "cm", old("c.arm"), "perímetro corrigido"),
    card("Músculo da coxa", cur("c.thigh"), "cm", old("c.thigh"), "perímetro corrigido"),
    card("Músculo do gémeo", cur("c.calf"), "cm", old("c.calf"), "perímetro corrigido"),
    card("Soma de 8 pregas", cur("sum8"), "mm", old("sum8"), ""),
    card("Soma de perímetros", cur("girth_sum"), "cm", old("girth_sum"), "braço + coxa + gémeo"));
  }
  function schedule() { clearTimeout(timer); dirty = true; setSaved("Por guardar…"); timer = setTimeout(push, 700); }
  async function push() {
   if (busy) { queued = true; return; }
   busy = true; setSaved("A guardar…");
   try {
    const sent = points; points = null;
    const r = await api(`${API}/sessions/${focus.session.id}/assessment`, {method: "PUT", body: JSON.stringify({measures: m, equation, version, points: sent || undefined})});
    version = r.assessment.version; focus.assessment = r.assessment; dirty = false; setSaved("Guardado");
    drawResults(r.assessment.results);
   } catch (e) { setSaved("Não guardado"); feedback(e.message, true); }
   finally { busy = false; if (queued) { queued = false; push(); } }
  }
  eqSel.addEventListener("change", () => { equation = eqSel.value; schedule(); });
  drawVisuals(); drawResults(a && a.results);
  host.append(nextButton("Seguir para o fecho →", "close"));
 }
 /* ---------- arranque ---------- */
 for (const b of document.querySelectorAll(".tm-cq-segment [data-tab]")) b.addEventListener("click", () => { tab = b.dataset.tab; renderList(); });
 $("tm-cq-search").addEventListener("input", e => { query = e.target.value; renderList(); });
 window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
 (async () => {
  try {
   const res = await fetch("/api/me", {credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}});
   const me = await res.json().catch(() => ({}));
   if (!res.ok || me.user?.role !== "admin") throw Error("unauthorized");
   csrf = me.csrf || "";
   auth.hidden = true; root.hidden = false;
   await loadWorkspace();
   const wanted = new URLSearchParams(location.search).get("client");
   if (wanted) selectClient(wanted);
   else if (data.today[0]) selectClient(data.today[0].client_id);
  } catch (e) {
   auth.textContent = e.message === "unauthorized" ? "É necessário iniciar sessão como administrador." : "Não foi possível carregar as consultas.";
   if (e.message === "unauthorized") { const a = el("a", "tm-cq-ghost", "Ir para o início de sessão"); a.href = "/"; auth.append(" ", a); }
  }
 })();
})();
