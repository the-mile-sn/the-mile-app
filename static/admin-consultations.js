"use strict";
/* Consultas: lista (Hoje / Por tratar / Todos), ficha do cliente e modo consulta
   (Nota → Fecho). Lê marcações e perfis; escreve apenas o registo da consulta. */
(() => {
 const $ = id => document.getElementById(id);
 const root = $("tm-cq-root"), auth = $("tm-cq-auth");
 if (!root || !auth) return;
 const API = "/api/v2/admin/consultations";
 const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
 const WEEKDAYS = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
 const INDICATORS = [["adherence","Adesão ao plano"],["energy","Energia nos treinos"],["sleep","Sono"],
  ["digestion","Conforto digestivo"],["hunger","Fome e saciedade"],["hydration","Hidratação"]];
 const MESSAGES = {stale_session:"Esta consulta foi alterada noutro lado. Recarreguei os dados.",
  session_closed:"Esta consulta já está fechada.", booking_not_linked:"Esta marcação ainda não está ligada a um perfil.",
  invalid_objectives:"Confirma os objetivos.", invalid_next_weeks:"Escolhe quando é a próxima consulta."};
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
  const profileLink = el("a", "tm-cq-ghost", "Perfil"); profileLink.href = "/?nav=players";
  profileLink.title = "Abre Clientes → Consultas para editar dados pessoais";
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

  const stats = el("div", "tm-cq-stats");
  const last = view.history[0];
  const stat = (label, value, sub) => { const s = el("section", "tm-cq-card tm-cq-stat"); s.append(el("p", "tm-cq-muted", label), el("strong", "", value)); if (sub) s.append(el("small", "tm-cq-muted", sub)); return s; };
  stats.append(stat("Consultas", String(view.closed), view.total > view.closed ? (view.total - view.closed) + " por fazer ou fechar" : "todas fechadas"));
  stats.append(stat("Última consulta", last ? dayLabel(last.date) : "—", last ? last.professional_name : "ainda nenhuma fechada"));
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
   focus = {...s, step: "note"};
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
 function closeFocus() {
  if (dirty && !confirm("Há alterações por guardar. Sair mesmo assim?")) return;
  clearTimeout(saveTimer); focus = null; dirty = false;
  $("tm-cq-focus").hidden = true; document.querySelector(".tm-cq-layout").hidden = false;
  loadWorkspace().then(() => openClient && selectClient(openClient)).catch(() => {});
 }
 function renderFocus() {
  const host = $("tm-cq-focus"); host.replaceChildren(); host.hidden = false;
  document.querySelector(".tm-cq-layout").hidden = true;
  const b = focus.booking, s = focus.session, closed = s.status === "closed";
  const bar = el("header", "tm-cq-focus-bar");
  const exit = el("button", "tm-cq-ghost", "← Sair"); exit.type = "button"; exit.addEventListener("click", closeFocus);
  const who = el("div", "tm-cq-focus-who");
  who.append(el("span", "tm-cq-avatar", initials(b.client_name)));
  const t = el("div"); t.append(el("strong", "", b.client_name + " · " + (b.first_visit ? "primeira consulta" : "seguimento")),
   el("small", "tm-cq-muted", (b.date === (data && data.date) ? "Hoje " : dayLabel(b.date) + " ") + b.start + " · " + (b.mode === "online" ? "online" : "presencial") + " · " + b.professional_name));
  who.append(t);
  bar.append(exit, who, el("span", "tm-cq-focus-saved tm-cq-muted", closed ? "Fechada" : "Guardado"));
  host.append(bar);

  const steps = [["note", "Nota", "Indicadores e notas"], ["assessment", "Avaliação", "Medições e cálculos"], ["close", "Fecho", "Plano, objetivos, próxima"]];
  if (b.first_visit) steps.unshift(["form", "Formulário", "Respostas do cliente"]);
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
  else if (focus.step === "assessment") renderSoon(content, "Avaliação", "O registo de pregas, perímetros e cálculos chega na próxima atualização.");
  else renderSoon(content, "Formulário", "As respostas do formulário pré-consulta aparecem aqui quando o novo formulário estiver ativo.");
  body.append(nav, content);
  host.append(body);
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
  care.append(el("p", "tm-cq-muted", notes || "As alergias, intolerâncias e medicação do formulário aparecem aqui quando o formulário estiver ativo."));
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
   b.addEventListener("click", () => { s.next_weeks = w; for (const x of seg.children) x.setAttribute("aria-selected", String(x === b)); queueSave({next_weeks: w}); });
   seg.append(b);
  }
  const how = el("div", "tm-cq-choices");
  for (const [value, title, hint] of [["link", "Enviar link para marcar", "A cliente escolhe o dia e paga no site"], ["book", "Marcar já", "Escolher o dia agora em Agendamentos"]]) {
   const b = el("button", "tm-cq-choice" + (s.next_action === value ? " is-on" : "")); b.type = "button"; b.disabled = closed;
   b.append(el("strong", "", title), el("small", "", hint));
   b.addEventListener("click", () => { s.next_action = value; for (const x of how.children) x.classList.toggle("is-on", x === b); queueSave({next_action: value}); });
   how.append(b);
  }
  next.append(el("p", "tm-cq-muted", "Daqui a"), seg, how);
  side.append(next);

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
     closeFocus();
    } catch (e) { feedback(e.message, true); }
   });
   actions.append(b);
  }
  host.append(actions);
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
