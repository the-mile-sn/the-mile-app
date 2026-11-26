"use strict";
/* Clientes de consulta (fase 1). Preenche o painel "Consultas" em Clientes.
   Só leitura/escrita na API /api/v2/admin/consult-clients; não toca nos jogadores nem nos Chefs. */
(() => {
  const panel = document.getElementById("tm-clients-consultations-panel");
  if (!panel) return;
  const API = "/api/v2/admin/consult-clients";
  const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  let csrf = "", professionals = [], clients = [], state = {q: "", status: "active", open: null};
  let loading = false, ready = false;

  async function api(path, options = {}) {
    if (!csrf) {
      const me = await fetch("/api/me", {cache: "no-store", credentials: "same-origin"});
      const data = await me.json().catch(() => ({}));
      if (me.status !== 200 || data.user?.role !== "admin") throw Error("Sessão de administrador necessária.");
      csrf = data.csrf || "";
    }
    const write = options.method && options.method !== "GET";
    const res = await fetch(path, {credentials: "same-origin", cache: "no-store", ...options,
      headers: {"Accept": "application/json", ...(write ? {"Content-Type": "application/json", "X-CSRF-Token": csrf} : {})}});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = Error(MESSAGES[data.error] || "Não foi possível concluir. Tenta novamente."); e.code = data.error; throw e; }
    return data;
  }
  const MESSAGES = {
    stale_client: "Este perfil foi alterado entretanto. Recarreguei os dados; volta a guardar.",
    client_archived: "Este perfil está arquivado.",
    invalid_name: "Indica o nome.", invalid_email: "Confirma o email.", invalid_guardian_email: "Confirma o email do responsável.",
    invalid_birth_date: "Confirma a data de nascimento.", invalid_height_cm: "A altura deve estar entre 50 e 250 cm.",
    invalid_arm_point_cm: "Confirma o ponto do braço (cm).", invalid_thigh_point_cm: "Confirma o ponto da coxa (cm).",
    invalid_professional: "Escolhe uma nutricionista válida.", invalid_merge: "Não é possível juntar estes perfis.",
    booking_not_found: "A marcação deixou de existir.",
  };

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtDay = d => { if (!d) return ""; const [y, m, day] = d.split("-"); return `${+day} ${MONTHS[+m - 1]} ${y}`; };
  const fmtTime = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const age = d => { if (!d) return ""; const b = new Date(d + "T12:00:00"), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return `${a} anos`; };
  const profName = id => professionals.find(p => p.id === id)?.name || "";
  function pill(text, kind) { return el("span", "tm-cc-pill" + (kind ? " is-" + kind : ""), text); }
  function feedback(msg, error) { const f = panel.querySelector(".tm-cc-feedback"); if (f) { f.textContent = msg || ""; f.classList.toggle("is-error", !!error); } }

  function shell() {
    panel.replaceChildren();
    panel.classList.add("tm-cc-ready");
    const head = el("div", "tm-cc-head");
    const title = el("div", "tm-cc-title");
    title.append(el("h2", "", "Consultas"), el("p", "tm-cc-sub", "Perfis de quem faz consultas. As marcações pagas no site ligam-se sozinhas pelo email."));
    const tools = el("div", "tm-cc-tools");
    const filter = el("div", "tm-cc-segment"); filter.setAttribute("role", "group"); filter.setAttribute("aria-label", "Estado");
    for (const [v, l] of [["active", "Ativos"], ["pending", "Por confirmar"], ["archived", "Arquivados"]]) {
      const b = el("button", v === state.status ? "is-on" : "", l); b.type = "button"; b.dataset.value = v; b.setAttribute("aria-pressed", String(v === state.status));
      b.addEventListener("click", () => { state.status = v; load(); }); filter.append(b);
    }
    tools.append(filter);
    head.append(title, tools);
    panel.append(head, el("div", "tm-cc-unassigned"), el("p", "tm-cc-feedback"), el("div", "tm-cc-list"), el("div", "tm-cc-detail"));
    panel.querySelector(".tm-cc-feedback").setAttribute("role", "status");
  }

  // Aberto a partir do Início (ex.: aniversário de um cliente de consulta).
  window.tmOpenConsultClient = async id => {
    window.tmDashboardOpenClientsPage?.();
    // Espera que a página Clientes termine de abrir antes de escolher o tipo.
    await new Promise(resolve => setTimeout(resolve, 0));
    window.tmSelectClientType?.("consulta");
    state.open = id; state.status = "active";
    await load();
    panel.scrollIntoView({behavior: "smooth", block: "start"});
  };
  async function load() {
    if (loading) return; loading = true;
    try {
      if (!professionals.length) {
        const cat = await api("/api/v2/admin/appointments/catalog");
        professionals = cat.professionals || [];
      }
      const params = new URLSearchParams({status: state.status}); if (state.q.trim()) params.set("q", state.q.trim());
      const data = await api(API + "?" + params);
      clients = data.clients || [];
      if (!ready) { ready = true; shell(); }
      for (const b of panel.querySelectorAll(".tm-cc-segment button")) { const on = b.dataset.value === state.status; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); }
      feedback("");
      renderList(data); await renderUnassigned(data.unassigned);
      if (state.open) openClient(state.open);
    } catch (e) {
      if (!ready) return; // mantém o texto original do painel se a API não estiver disponível
      feedback(e.message, true);
    } finally { loading = false; }
  }

  function renderList(data) {
    const list = panel.querySelector(".tm-cc-list"); list.replaceChildren();
    if (!clients.length) { list.append(el("p", "tm-cc-empty", state.q ? "Sem resultados." : "Ainda não há clientes de consulta neste estado.")); return; }
    for (const c of clients) {
      const card = el("button", "tm-cc-card"); card.type = "button";
      const avatar = el("span", "tm-cc-avatar", (c.name || "?").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase());
      const main = el("span", "tm-cc-card-main");
      const top = el("span", "tm-cc-card-top"); top.append(el("strong", "", c.name));
      if (c.status === "pending") top.append(pill("Por confirmar", "warn"));
      if (c.status === "archived") top.append(pill("Arquivado"));
      const meta = el("span", "tm-cc-meta", [c.email, c.phone].filter(Boolean).join(" · ") || "Sem contacto");
      main.append(top, meta);
      const side = el("span", "tm-cc-card-side");
      if (c.next_booking) side.append(el("span", "", "Próxima: " + fmtDay(c.next_booking.day) + " · " + fmtTime(c.next_booking.start_minute)));
      else if (c.last_booking) side.append(el("span", "", "Última: " + fmtDay(c.last_booking.day)));
      side.append(el("span", "tm-cc-muted", `${c.bookings_count} ${c.bookings_count === 1 ? "consulta" : "consultas"}${c.active_professional_id ? " · " + profName(c.active_professional_id) : ""}`));
      card.append(avatar, main, side);
      card.addEventListener("click", () => openClient(c.id));
      list.append(card);
    }
    if (data.truncated) list.append(el("p", "tm-cc-muted", "A mostrar os primeiros 500. Usa a pesquisa."));
  }

  async function renderUnassigned(count) {
    const box = panel.querySelector(".tm-cc-unassigned"); box.replaceChildren();
    if (!count) return;
    const details = el("details", "tm-cc-queue");
    details.append(el("summary", "", `${count} ${count === 1 ? "marcação por associar" : "marcações por associar"} a um perfil`));
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded) return; details.dataset.loaded = "1";
      try {
        const data = await api(API + "/unassigned");
        const all = await api(API + "?status=active");
        for (const b of data.bookings) {
          const row = el("div", "tm-cc-queue-row");
          row.append(el("span", "", `${b.name || "Sem nome"} · ${b.email || "sem email"} · ${fmtDay(b.day)} ${fmtTime(b.start_minute)}`));
          const sel = el("select"); sel.setAttribute("aria-label", "Associar a");
          sel.append(new Option("Associar a…", ""));
          for (const c of all.clients) sel.append(new Option(`${c.name}${c.email ? " · " + c.email : ""}`, c.id));
          const go = el("button", "tm-cc-secondary", "Associar"); go.type = "button";
          go.addEventListener("click", async () => {
            if (!sel.value) return;
            try { await api(API + "/link", {method: "POST", body: JSON.stringify({kind: b.kind, booking_id: b.id, client_id: sel.value})}); load(); }
            catch (e) { feedback(e.message, true); }
          });
          row.append(sel, go); details.append(row);
        }
      } catch (e) { feedback(e.message, true); }
    });
    box.append(details);
  }

  function field(label, name, value, opts = {}) {
    const wrap = el("label", "tm-cc-field" + (opts.wide ? " is-wide" : ""));
    wrap.append(el("span", "", label));
    let input;
    if (opts.options) { input = el("select"); for (const [v, l] of opts.options) input.append(new Option(l, v)); input.value = value ?? ""; }
    else if (opts.textarea) { input = el("textarea"); input.rows = 3; input.value = value ?? ""; }
    else { input = el("input"); input.type = opts.type || "text"; input.value = value ?? ""; if (opts.inputmode) input.inputMode = opts.inputmode; if (opts.placeholder) input.placeholder = opts.placeholder; }
    input.name = name; wrap.append(input);
    if (opts.hint) wrap.append(el("small", "", opts.hint));
    return wrap;
  }

  async function openClient(id) {
    state.open = id;
    const detail = panel.querySelector(".tm-cc-detail");
    let c;
    try { c = await api(API + "/" + encodeURIComponent(id)); } catch (e) { feedback(e.message, true); return; }
    panel.classList.add("is-detail");
    detail.replaceChildren();
    const back = el("button", "tm-cc-back", "‹ Consultas"); back.type = "button";
    back.addEventListener("click", () => { state.open = null; panel.classList.remove("is-detail"); detail.replaceChildren(); load(); });

    const header = el("div", "tm-cc-profile");
    const who = el("div", "tm-cc-who");
    who.append(el("span", "tm-cc-avatar is-large", (c.name || "?").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase()));
    const txt = el("div");
    const name = el("h3", "", c.name);
    const pills = el("div", "tm-cc-pills"); pills.append(pill("Cliente de consulta", "brand"));
    if (c.status === "pending") pills.append(pill("Por confirmar", "warn"));
    if (c.status === "archived") pills.append(pill("Arquivado"));
    txt.append(name, pills, el("p", "tm-cc-muted", [age(c.birth_date), c.email, c.phone].filter(Boolean).join(" · ")));
    who.append(txt);
    const actions = el("div", "tm-cc-actions");
    if (c.status === "pending") {
      const ok = el("button", "tm-cc-primary", "Confirmar perfil"); ok.type = "button";
      ok.addEventListener("click", async () => { try { await api(`${API}/${id}/confirm`, {method: "POST", body: JSON.stringify({version: c.version})}); openClient(id); } catch (e) { feedback(e.message, true); } });
      actions.append(ok);
    }
    header.append(who, actions);

    const form = el("form", "tm-cc-form");
    const sec = (title, note) => { const s = el("section", "tm-cc-section"); const h = el("div", "tm-cc-section-head"); h.append(el("h4", "", title)); if (note) h.append(el("span", "tm-cc-muted", note)); s.append(h); const g = el("div", "tm-cc-grid"); s.append(g); form.append(s); return g; };
    const g1 = sec("Dados pessoais");
    g1.append(field("Nome", "name", c.name), field("Email", "email", c.email, {type: "email"}), field("Telefone", "phone", c.phone, {type: "tel"}),
      field("Data de nascimento", "birth_date", c.birth_date, {type: "date"}),
      field("Sexo", "sex", c.sex, {options: [["", "—"], ["F", "Feminino"], ["M", "Masculino"]]}),
      field("Altura (cm)", "height_cm", c.height_cm ?? "", {inputmode: "decimal"}),
      field("Nutricionista ativa", "active_professional_id", c.active_professional_id || "", {options: [["", "Sem nutricionista"], ...professionals.filter(p => p.active || p.id === c.active_professional_id).map(p => [p.id, p.name])]}));
    const g2 = sec("Responsável", "Quando a consulta é marcada por outra pessoa (por exemplo, menores)");
    g2.append(field("Nome", "guardian_name", c.guardian_name), field("Relação", "guardian_relation", c.guardian_relation, {placeholder: "Mãe, pai…"}),
      field("Email", "guardian_email", c.guardian_email, {type: "email"}), field("Telefone", "guardian_phone", c.guardian_phone, {type: "tel"}));
    const g3 = sec("Avaliação", "Só equipa clínica · usado nos cálculos");
    g3.append(field("Ponto do braço (cm)", "arm_point_cm", c.arm_point_cm ?? "", {inputmode: "decimal", hint: "Metade da distância acrómio–olecrânio"}),
      field("Ponto da coxa (cm)", "thigh_point_cm", c.thigh_point_cm ?? "", {inputmode: "decimal", hint: "Metade da distância da coxa"}),
      field("Etnia (para a massa muscular)", "ethnic_adjustment", c.ethnic_adjustment, {options: [["none", "Caucasiana ou outra (sem ajuste)"], ["african", "Afrodescendente (+1,1 kg)"]], hint: "Usada só na equação de Lee da massa muscular, como no estudo. Não aparece ao cliente."}));
    const g4 = sec("Notas internas");
    g4.append(field("", "notes", c.notes, {textarea: true, wide: true}));
    const save = el("div", "tm-cc-save"); const saveBtn = el("button", "tm-cc-primary", "Guardar alterações"); saveBtn.type = "submit";
    save.append(saveBtn); form.append(save);
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const payload = {version: c.version};
      for (const input of form.querySelectorAll("[name]")) payload[input.name] = input.value;
      saveBtn.disabled = true;
      try { await api(API + "/" + id, {method: "PUT", body: JSON.stringify(payload)}); feedback("Perfil guardado."); openClient(id); }
      catch (e) { feedback(e.message, true); if (e.code === "stale_client") openClient(id); }
      finally { saveBtn.disabled = false; }
    });
    if (c.status === "archived") form.querySelectorAll("input,select,textarea,button").forEach(x => x.disabled = true);

    const timeline = el("section", "tm-cc-section tm-cc-timeline");
    const th = el("div", "tm-cc-section-head"); th.append(el("h4", "", "Consultas"), el("span", "tm-cc-muted", `${c.bookings_count} no total`)); timeline.append(th);
    if (!c.bookings.length) timeline.append(el("p", "tm-cc-muted", "Sem marcações ligadas."));
    const today = new Date().toISOString().slice(0, 10);
    for (const b of [...c.bookings].reverse()) {
      const row = el("div", "tm-cc-booking" + (b.day >= today && b.status !== "cancelled" ? " is-next" : ""));
      const left = el("div");
      left.append(el("span", "tm-cc-muted", `${fmtDay(b.day)} · ${fmtTime(b.start_minute)}–${fmtTime(b.end_minute)} · ${b.professional_name}`),
        el("strong", "", `${b.service_name} · ${b.mode === "online" ? "Online" : "Presencial"}`));
      const right = el("div", "tm-cc-pills");
      if (b.status === "cancelled") right.append(pill("Cancelada"));
      else right.append(pill(b.kind === "shopify" ? "Paga no site" : "Marcada no backoffice", b.kind === "shopify" ? "ok" : ""));
      row.append(left, right); timeline.append(row);
    }

    const more = el("section", "tm-cc-section tm-cc-more");
    const mh = el("div", "tm-cc-section-head"); mh.append(el("h4", "", "Gestão do perfil")); more.append(mh);
    const mergeRow = el("div", "tm-cc-queue-row");
    const target = el("select"); target.setAttribute("aria-label", "Juntar a outro perfil"); target.append(new Option("Juntar a outro perfil…", ""));
    for (const o of clients.filter(x => x.id !== id && x.status !== "archived")) target.append(new Option(`${o.name}${o.email ? " · " + o.email : ""}`, o.id));
    const mergeBtn = el("button", "tm-cc-secondary", "Juntar"); mergeBtn.type = "button";
    mergeBtn.addEventListener("click", async () => {
      if (!target.value) return;
      if (!confirm("As consultas deste perfil passam para o perfil escolhido e este fica arquivado. Continuar?")) return;
      try { await api(`${API}/${id}/merge`, {method: "POST", body: JSON.stringify({target_id: target.value})}); state.open = target.value; load(); }
      catch (e) { feedback(e.message, true); }
    });
    mergeRow.append(target, mergeBtn); more.append(mergeRow);
    if (c.status !== "archived") {
      const arch = el("button", "tm-cc-danger", "Arquivar perfil"); arch.type = "button";
      arch.addEventListener("click", async () => {
        if (!confirm("Arquivar este perfil? As consultas continuam guardadas.")) return;
        try { await api(`${API}/${id}/archive`, {method: "POST", body: JSON.stringify({version: c.version})}); state.open = null; panel.classList.remove("is-detail"); load(); }
        catch (e) { feedback(e.message, true); }
      });
      more.append(arch);
    }
    const hist = el("details", "tm-cc-history"); hist.append(el("summary", "", "Histórico de alterações"));
    const LABEL = {created: "Perfil criado", updated: "Dados alterados", status: "Estado alterado", merged_into: "Junto a outro perfil", merged_from: "Recebeu outro perfil", booking_linked: "Marcação associada"};
    for (const ev of c.events) hist.append(el("p", "tm-cc-muted", `${new Date(ev.at * 1000).toLocaleString("pt-PT")} · ${LABEL[ev.action] || ev.action}${ev.actor === "system" ? " (automático)" : ""}`));
    more.append(hist);

    const grid = el("div", "tm-cc-layout"); const main = el("div", "tm-cc-main"); main.append(form); const aside = el("div", "tm-cc-aside"); aside.append(timeline, more);
    grid.append(main, aside);
    detail.append(back, header, grid);
    detail.scrollIntoView({block: "start", behavior: "smooth"});
  }

  function openCreate() {
    const detail = panel.querySelector(".tm-cc-detail");
    panel.classList.add("is-detail"); detail.replaceChildren();
    const back = el("button", "tm-cc-back", "‹ Consultas"); back.type = "button";
    back.addEventListener("click", () => { panel.classList.remove("is-detail"); detail.replaceChildren(); });
    const form = el("form", "tm-cc-form"); const s = el("section", "tm-cc-section"); const h = el("div", "tm-cc-section-head"); h.append(el("h4", "", "Novo cliente de consulta")); s.append(h);
    const g = el("div", "tm-cc-grid");
    g.append(field("Nome", "name", ""), field("Email", "email", "", {type: "email"}), field("Telefone", "phone", "", {type: "tel"}), field("Data de nascimento", "birth_date", "", {type: "date"}),
      field("Nutricionista ativa", "active_professional_id", "", {options: [["", "Sem nutricionista"], ...professionals.filter(p => p.active).map(p => [p.id, p.name])]}));
    s.append(g); form.append(s);
    const btn = el("button", "tm-cc-primary", "Criar perfil"); btn.type = "submit"; const save = el("div", "tm-cc-save"); save.append(btn); form.append(save);
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); const payload = {}; for (const i of form.querySelectorAll("[name]")) payload[i.name] = i.value;
      btn.disabled = true;
      try { const r = await api(API, {method: "POST", body: JSON.stringify(payload)}); state.open = r.id; load(); }
      catch (e) { feedback(e.message, true); } finally { btn.disabled = false; }
    });
    detail.append(back, form);
  }

  // Usa a pesquisa e o botão "Novo cliente" que já existem em Clientes.
  const globalSearch = document.getElementById("tm-players-filter");
  const accessFilter = document.getElementById("tm-players-access");
  const accessWrap = accessFilter?.closest("label.tm-players-select-label");
  let t;
  globalSearch?.addEventListener("input", () => {
    if (panel.hidden) return;
    clearTimeout(t); t = setTimeout(() => { state.q = globalSearch.value || ""; state.open = null; panel.classList.remove("is-detail"); panel.querySelector(".tm-cc-detail")?.replaceChildren(); load(); }, 250);
  });
  window.tmOpenConsultCreate = () => { const go = () => openCreate(); if (ready) go(); else load().then(go); };
  // Carrega quando o painel fica visível (filtro "Consultas" em Clientes).
  const observer = new MutationObserver(() => {
    if (accessWrap) accessWrap.style.visibility = panel.hidden ? "" : "hidden";
    if (!panel.hidden) { state.q = globalSearch?.value || ""; load(); }
  });
  observer.observe(panel, {attributes: true, attributeFilter: ["hidden"]});
  if (!panel.hidden) load();
})();
