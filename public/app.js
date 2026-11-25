const appState = {
  roleId: 'logist',
  carrierId: 'carrier-gromov',
  roles: [],
  carriers: [],
  demoDocumentPresets: [],
  trips: [],
  selectedTripId: null,
  mobileDetailOpen: false,
  lastStampKey: null,
  tripFilter: 'all',
  showProposeForm: false,
  showDisputeForm: false,
  showReturnDocForm: false,
  integrityResultByTrip: {},
  exportInFlight: false,
};

const els = {
  roleSwitcher: document.getElementById('roleSwitcher'),
  roleContextBar: document.getElementById('roleContextBar'),
  resetDemoBtn: document.getElementById('resetDemoBtn'),
  toastArea: document.getElementById('toastArea'),
  workspace: document.getElementById('workspace'),
  tripListSubtitle: document.getElementById('tripListSubtitle'),
  tripFilterTabs: document.getElementById('tripFilterTabs'),
  tripList: document.getElementById('tripList'),
  openCreateModalBtn: document.getElementById('openCreateModalBtn'),
  emptyDetailState: document.getElementById('emptyDetailState'),
  tripDetailContent: document.getElementById('tripDetailContent'),
  createTripModal: document.getElementById('createTripModal'),
  createTripForm: document.getElementById('createTripForm'),
  createCarrierSelect: document.getElementById('createCarrierSelect'),
  closeCreateModalBtn: document.getElementById('closeCreateModalBtn'),
  cancelCreateModalBtn: document.getElementById('cancelCreateModalBtn'),
};

const ICON = {
  check: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>',
  cross: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  doc: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10"/></svg>',
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRub(amount) {
  if (amount == null) return '—';
  return `${Number(amount).toLocaleString('ru-RU')} ₽`;
}

function formatDateRu(isoDate) {
  if (!isoDate) return '—';
  const parts = String(isoDate).split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoDate;
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(fullName) {
  return String(fullName || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function showToast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${esc(message)}</span><button type="button" class="icon-btn" aria-label="Скрыть">✕</button>`;
  node.querySelector('button').addEventListener('click', () => node.remove());
  els.toastArea.prepend(node);
  setTimeout(() => {
    if (node.parentNode) node.remove();
  }, 6000);
}

function persistViewPrefs() {
  try {
    localStorage.setItem('urfu_freight_role', appState.roleId);
    localStorage.setItem('urfu_freight_carrier', appState.carrierId);
    if (appState.selectedTripId) {
      localStorage.setItem('urfu_freight_trip', appState.selectedTripId);
    }
    const params = new URLSearchParams();
    params.set('role', appState.roleId);
    if (appState.selectedTripId) params.set('trip', appState.selectedTripId);
    window.history.replaceState(null, '', `#${params.toString()}`);
  } catch {
    // Ignore storage errors
  }
}

function loadViewPrefs() {
  let savedRoleLs = null;
  let savedTripLs = null;
  try {
    savedRoleLs = localStorage.getItem('urfu_freight_role');
    savedTripLs = localStorage.getItem('urfu_freight_trip');
    const savedCarrier = localStorage.getItem('urfu_freight_carrier');
    if (savedCarrier) appState.carrierId = savedCarrier;
  } catch {
    // Ignore storage errors
  }
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const hashRole = params.get('role');
  const hashTrip = params.get('trip');
  const savedRole = hashRole || savedRoleLs || 'logist';
  const savedTrip = hashTrip || savedTripLs || 'trip-demo-7684';
  appState.roleId = ['logist', 'carrier', 'receiver', 'accountant'].includes(savedRole)
    ? savedRole
    : 'logist';
  appState.selectedTripId = savedTrip;
  if (window.innerWidth <= 1024 && hashTrip) {
    appState.mobileDetailOpen = true;
  }
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Ошибка запроса (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function getSelectedTrip() {
  return appState.trips.find((t) => t.id === appState.selectedTripId) || null;
}

function resetForms() {
  appState.showProposeForm = false;
  appState.showDisputeForm = false;
  appState.showReturnDocForm = false;
}

async function switchRole(nextRole, { notice = true } = {}) {
  if (nextRole === appState.roleId) return;
  appState.roleId = nextRole;
  resetForms();
  await loadState({ keepSelection: true, switchNotice: notice });
}

async function loadState({ keepSelection = true, switchNotice = false } = {}) {
  const prevTripId = appState.selectedTripId;
  const carrierQuery = appState.roleId === 'carrier' ? `&carrier=${encodeURIComponent(appState.carrierId)}` : '';
  const data = await apiFetch(`/api/state?role=${encodeURIComponent(appState.roleId)}${carrierQuery}`);
  appState.roles = data.roles;
  appState.carriers = data.carriers;
  appState.demoDocumentPresets = data.demoDocumentPresets;
  appState.trips = data.trips;

  if (keepSelection && prevTripId) {
    const stillVisible = appState.trips.some((t) => t.id === prevTripId);
    if (stillVisible) {
      appState.selectedTripId = prevTripId;
    } else {
      if (switchNotice && appState.roleId === 'carrier') {
        showToast('Выбранный рейс назначен другому перевозчику. Показаны только ваши рейсы.', 'info');
      }
      appState.selectedTripId = appState.trips[0]?.id || null;
      appState.mobileDetailOpen = false;
    }
  } else if (!appState.selectedTripId || !appState.trips.some((t) => t.id === appState.selectedTripId)) {
    appState.selectedTripId = appState.trips[0]?.id || null;
  }

  persistViewPrefs();
  renderAll();
}

function renderAll() {
  renderTopbar();
  renderTripList();
  renderTripDetail();
  els.workspace.classList.toggle('mobile-detail-open', Boolean(appState.mobileDetailOpen && getSelectedTrip()));
}

/* ------------------------------------------------------------
   Доменные хелперы для UX: «чей ход» и «что может сделать роль»
   ------------------------------------------------------------ */

function isMyTurn(trip, roleId = appState.roleId) {
  const s = trip.summary;
  if (trip.accounting.exportRecord) return false;
  if (trip.delivery.status === 'disputed') return roleId === 'receiver' || roleId === 'logist';
  if (s.latestDoc && s.latestDoc.status === 'submitted' && !s.pendingVersion) {
    if (roleId === 'logist' || roleId === 'accountant') return true;
  }
  if (roleId === 'receiver' && trip.delivery.status !== 'confirmed' && !s.pendingVersion) return true;
  if (roleId === 'carrier' && (s.pendingVersion || !s.latestDoc || s.latestDoc.status === 'returned')) return true;
  if (roleId === 'accountant' && s.settlement.ready) return true;
  return false;
}

function getRoleActions(trip, roleId = appState.roleId) {
  const s = trip.summary;
  const latestDoc = s.latestDoc;
  const exported = Boolean(trip.accounting.exportRecord);
  return {
    confirmPending: roleId === 'carrier' && Boolean(s.pendingVersion),
    upload: roleId === 'carrier' && (!latestDoc || latestDoc.status === 'returned'),
    delivery: roleId === 'receiver' && trip.delivery.status !== 'confirmed',
    disputeLate: roleId === 'receiver' && trip.delivery.status === 'confirmed' && !exported,
    review: (roleId === 'logist' || roleId === 'accountant') && Boolean(latestDoc) && latestDoc.status === 'submitted',
    export: roleId === 'accountant' && s.settlement.ready,
  };
}

function hasPrimaryAction(actions) {
  return actions.confirmPending || actions.upload || actions.delivery || actions.review || actions.export;
}

function buildStages(trip) {
  const s = trip.summary;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;
  const doc = s.latestDoc;
  const exported = Boolean(trip.accounting.exportRecord);

  const terms = pending
    ? { state: 'todo', note: confirmed ? `Правка v${pending.version} ждёт подтверждения` : 'Ждём перевозчика' }
    : confirmed
      ? { state: 'done', note: `Согласована v${confirmed.version}` }
      : { state: 'todo', note: 'Ждём перевозчика' };

  const delivery =
    trip.delivery.status === 'confirmed'
      ? { state: 'done', note: 'Груз получен' }
      : trip.delivery.status === 'disputed'
        ? { state: 'alert', note: 'Спор при приёмке' }
        : { state: 'todo', note: 'Ждём получателя' };

  const docs = !doc
    ? { state: 'todo', note: 'Не загружена' }
    : doc.status === 'accepted'
      ? { state: 'done', note: 'Принята' }
      : doc.status === 'returned'
        ? { state: 'alert', note: 'Нужны исправления' }
        : { state: 'todo', note: 'На проверке' };

  const settle = exported
    ? { state: 'done', note: `Распоряжение ${trip.accounting.exportRecord.dispatchNumber}` }
    : s.settlement.ready
      ? { state: 'todo', note: 'Готов к выгрузке' }
      : s.settlement.status === 'manual_review'
        ? { state: 'alert', note: 'Заблокирован' }
        : { state: 'todo', note: 'Ожидает остальные шаги' };

  const stages = [
    { label: 'Условия', ...terms },
    { label: 'Приёмка груза', ...delivery },
    { label: 'Накладная', ...docs },
    { label: 'Выгрузка в 1С', ...settle },
  ];

  const firstOpen = stages.findIndex((st) => st.state === 'todo');
  if (firstOpen >= 0) stages[firstOpen].state = 'active';
  return stages;
}

/* ------------------------------------------------------------
   Топбар и список рейсов
   ------------------------------------------------------------ */

function renderTopbar() {
  els.roleSwitcher.innerHTML = appState.roles
    .map((r) => {
      return `
      <button
        type="button"
        role="tab"
        aria-selected="${r.id === appState.roleId}"
        class="role-btn ${r.id === appState.roleId ? 'active' : ''}"
        data-role="${esc(r.id)}"
        title="${esc(r.person)} · ${esc(r.org)}"
      >
        <span class="role-avatar" aria-hidden="true">${esc(initials(r.person))}</span>
        <span class="role-name">${esc(r.label)}</span>
      </button>`;
    })
    .join('');

  els.roleSwitcher.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchRole(btn.dataset.role));
  });

  const activeRole = appState.roles.find((r) => r.id === appState.roleId);
  if (activeRole) {
    if (activeRole.id === 'carrier') {
      const isDefaultCarrier = appState.carrierId === 'carrier-gromov';
      els.roleContextBar.innerHTML = `
        <span>Вы: <strong>${isDefaultCarrier ? esc(activeRole.person) : 'Представитель перевозчика'}</strong>,
          <select id="carrierSelect" class="inline-select" aria-label="Организация перевозчика">
            ${appState.carriers.map((c) => `<option value="${esc(c.id)}" ${c.id === appState.carrierId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </span>
        <span>${esc(activeRole.hint)}</span>
      `;
      document.getElementById('carrierSelect').addEventListener('change', async (e) => {
        appState.carrierId = e.target.value;
        appState.selectedTripId = null;
        appState.mobileDetailOpen = false;
        resetForms();
        await loadState({ keepSelection: false });
      });
    } else {
      els.roleContextBar.innerHTML = `
        <span>Вы: <strong>${esc(activeRole.person)}</strong>, ${esc(activeRole.org)}</span>
        <span>${esc(activeRole.hint)}</span>
      `;
    }
  }

  els.openCreateModalBtn.classList.toggle('hidden', appState.roleId !== 'logist');

  // Populate carrier dropdown in create modal
  els.createCarrierSelect.innerHTML = appState.carriers
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.fleet)}</option>`)
    .join('');
}

function renderTripList() {
  const all = appState.trips;
  const mine = all.filter((t) => isMyTurn(t));
  const filter = appState.tripFilter;
  const shown = filter === 'mine' ? mine : all;

  els.tripListSubtitle.textContent =
    appState.roleId === 'carrier' ? `Назначенные вам рейсы: ${all.length}` : `Всего рейсов: ${all.length}`;

  els.tripFilterTabs.innerHTML = `
    <button type="button" class="filter-tab ${filter === 'all' ? 'active' : ''}" data-filter="all">Все <span class="count">${all.length}</span></button>
    <button type="button" class="filter-tab ${filter === 'mine' ? 'active' : ''}" data-filter="mine">Ваш ход <span class="count">${mine.length}</span></button>
  `;
  els.tripFilterTabs.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.tripFilter = btn.dataset.filter;
      renderTripList();
    });
  });

  if (all.length === 0) {
    els.tripList.innerHTML = `<div class="empty-state">Рейсов пока нет.</div>`;
    return;
  }
  if (shown.length === 0) {
    els.tripList.innerHTML = `<div class="empty-state">Сейчас от вас ничего не требуется.<br/>Все рейсы ждут других участников.</div>`;
    return;
  }

  els.tripList.innerHTML = shown
    .map((trip) => {
      const s = trip.summary;
      const isSelected = trip.id === appState.selectedTripId;
      const mineTurn = isMyTurn(trip);
      const shownRate = s.confirmedVersion
        ? formatRub(s.confirmedVersion.rateRub)
        : `${formatRub(trip.versions[0]?.rateRub)} · не согл.`;
      const shownTime = s.confirmedVersion ? s.confirmedVersion.loadingTime : trip.versions[0]?.loadingTime;
      const pendingMark = s.pendingVersion && s.confirmedVersion
        ? ` · правка ${s.confirmedVersion.loadingTime} → ${s.pendingVersion.loadingTime}`
        : '';

      return `
        <button type="button" class="trip-row ${isSelected ? 'selected' : ''} ${mineTurn ? 'my-turn' : ''}" data-trip-id="${esc(trip.id)}">
          <div class="trip-row-top">
            <span class="trip-number num">${esc(trip.number)}${trip.isDemo ? ' · демо' : ''}</span>
            <span class="trip-rate num">${esc(shownRate)}</span>
          </div>
          <div class="trip-route">${esc(trip.origin)} → ${esc(trip.destination)}</div>
          <div class="trip-meta">
            <span>${esc(trip.carrierName)}</span>
            <span class="num">Погрузка ${esc(shownTime)}${esc(pendingMark)}</span>
          </div>
          <div class="trip-row-footer">
            <span class="badge ${esc(s.nextActionTone)}">${esc(s.nextAction)}</span>
            <span class="turn-label ${mineTurn ? 'mine' : ''}">${mineTurn ? 'Ваш ход' : `Ход: ${esc(s.ownerLabel)}`}</span>
          </div>
        </button>
      `;
    })
    .join('');

  els.tripList.querySelectorAll('.trip-row').forEach((row) => {
    row.addEventListener('click', () => {
      appState.selectedTripId = row.dataset.tripId;
      appState.mobileDetailOpen = true;
      resetForms();
      persistViewPrefs();
      renderAll();
      window.scrollTo({ top: 0 });
    });
  });
}

/* ------------------------------------------------------------
   Карточка рейса
   ------------------------------------------------------------ */

function renderVersionStatusBadge(status) {
  if (status === 'confirmed') return '<span class="badge success">Согласована</span>';
  if (status === 'pending') return '<span class="badge warning">Ждёт перевозчика</span>';
  return '<span class="badge neutral">Заменена</span>';
}

function renderDocStatusBadge(status) {
  if (status === 'accepted') return '<span class="badge success">Принята</span>';
  if (status === 'returned') return '<span class="badge danger">Возвращена</span>';
  return '<span class="badge info">На проверке</span>';
}

function renderStepper(trip) {
  const stages = buildStages(trip);
  return `
    <ol class="stepper" aria-label="Этапы рейса">
      ${stages
        .map(
          (st, i) => `
        <li class="step ${st.state}" ${st.state === 'active' ? 'aria-current="step"' : ''}>
          <span class="step-dot">${st.state === 'done' ? ICON.check : st.state === 'alert' ? '!' : i + 1}</span>
          <span class="step-text">
            <span class="step-label">${esc(st.label)}</span>
            <span class="step-note" style="display:block">${esc(st.note)}</span>
          </span>
        </li>`
        )
        .join('')}
    </ol>
  `;
}

function buildNarrative(trip) {
  const s = trip.summary;
  const role = appState.roleId;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;
  const doc = s.latestDoc;

  if (trip.delivery.status === 'disputed') {
    return {
      tone: 'danger',
      title: 'Спор при приёмке — расчёт заблокирован',
      text: `Причина: «${trip.delivery.disputeReason}». Выгрузка в 1С недоступна, пока получатель не снимет спор.`,
    };
  }

  if (pending) {
    let diffHtml = '';
    if (confirmed) {
      const parts = [];
      if (confirmed.loadingTime !== pending.loadingTime) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(confirmed.loadingTime)}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(pending.loadingTime)}</span></span>`);
      }
      if (confirmed.loadingDate !== pending.loadingDate) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(formatDateRu(confirmed.loadingDate))}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(formatDateRu(pending.loadingDate))}</span></span>`);
      }
      if (confirmed.rateRub !== pending.rateRub) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(formatRub(confirmed.rateRub))}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(formatRub(pending.rateRub))}</span></span>`);
      }
      diffHtml = parts.length ? `<div class="diff-row">${parts.join('')}</div>` : '';
    } else {
      diffHtml = `<div class="diff-row"><span class="diff-pill num">${esc(formatDateRu(pending.loadingDate))}, <strong>${esc(pending.loadingTime)}</strong></span><span class="diff-pill num"><strong>${esc(formatRub(pending.rateRub))}</strong></span></div>`;
    }
    const author = `Автор: ${esc(pending.proposedByName)}${pending.note ? ` · «${esc(pending.note)}»` : ''}`;
    const acc = role === 'accountant'
      ? `<br/><strong>Для бухгалтерии:</strong> неподтверждённая правка в расчёт не передана. Актуальная ставка: ${confirmed ? esc(formatRub(confirmed.rateRub)) : 'ещё не согласована'}.`
      : '';
    return {
      tone: 'warning',
      title: confirmed ? `Новые условия (v${pending.version}) ждут подтверждения` : 'Перевозчик должен принять условия рейса',
      text: `${author}${acc}`,
      extra: diffHtml,
    };
  }

  if (doc && doc.status === 'returned') {
    return {
      tone: 'danger',
      title: 'Накладную нужно исправить',
      text: `Замечание (${doc.reviewedBy}): «${doc.reviewComment}»`,
    };
  }

  if (doc && doc.status === 'submitted') {
    return {
      tone: 'info',
      title: 'Накладная загружена и ждёт проверки',
      text: `Файл «${doc.fileName}», версия v${doc.version}. Её принимает логист или бухгалтер.`,
    };
  }

  if (trip.delivery.status !== 'confirmed') {
    return {
      tone: 'info',
      title: 'Ждём подтверждения получения груза',
      text: `Получение подтверждает ${trip.receiverName}. Если есть расхождение, его нужно зафиксировать сразу.`,
    };
  }

  if (!doc) {
    return {
      tone: 'warning',
      title: 'Нужна транспортная накладная',
      text: 'Груз получен. Перевозчик прикладывает скан накладной, дальше её проверяют.',
    };
  }

  if (trip.accounting.exportRecord) {
    const rec = trip.accounting.exportRecord;
    return {
      tone: 'success',
      title: 'Рейс закрыт — выгрузка для 1С сформирована',
      text: `Распоряжение ${rec.dispatchNumber} · ${formatTimestamp(rec.createdAt)}. Повторное скачивание не создаёт дубль.`,
    };
  }

  return {
    tone: 'success',
    title: 'Готов к расчёту',
    text: `Условия v${confirmed.version} согласованы, груз получен, накладная принята. Сумма к сверке: ${formatRub(confirmed.rateRub)}.`,
  };
}

function renderUploadBlock(latestDoc) {
  const returned = latestDoc?.status === 'returned';
  return `
    <div class="inline-panel form-stack">
      <div class="panel-title">${returned ? 'Приложите исправленную накладную' : 'Приложите транспортную накладную'}</div>
      <div class="doc-presets">
        ${appState.demoDocumentPresets
          .map((p) => {
            const recommended = returned && p.id === 'tn_signed_complete';
            return `
          <button type="button" class="preset-card preset-doc-btn ${recommended ? 'recommended' : ''}" data-preset-id="${esc(p.id)}">
            <span class="preset-icon">${ICON.doc}</span>
            <span>
              <span class="preset-name">${esc(p.label)}</span>
              <span class="preset-desc" style="display:block">${esc(p.description || 'Демо-файл для быстрого показа')}</span>
            </span>
          </button>`;
          })
          .join('')}
      </div>
      <label class="field">
        <span>Или загрузите свой файл (PDF / JPG / TXT)</span>
        <input type="file" id="customDocFileInput" />
      </label>
    </div>
  `;
}

function renderActionCard(trip) {
  const s = trip.summary;
  const role = appState.roleId;
  const nar = buildNarrative(trip);
  const actions = getRoleActions(trip);
  const mine = hasPrimaryAction(actions) && isMyTurn(trip);
  const pending = s.pendingVersion;
  const confirmed = s.confirmedVersion;
  const doc = s.latestDoc;
  const exported = Boolean(trip.accounting.exportRecord);

  const body = [];

  if (actions.confirmPending) {
    const timeChanged = confirmed && confirmed.loadingTime !== pending.loadingTime;
    const label = confirmed && timeChanged
      ? `Подтвердить ${pending.loadingTime}`
      : confirmed
        ? `Подтвердить v${pending.version}`
        : `Принять условия (${pending.loadingTime})`;
    body.push(`<div class="btn-row"><button type="button" class="btn btn-primary btn-lg" id="confirmPendingBtn" data-version-id="${esc(pending.id)}">${esc(label)}</button></div>`);
  }

  if (actions.delivery) {
    body.push(`
      <div class="btn-row">
        <button type="button" class="btn btn-success btn-lg" id="confirmDeliveryBtn">
          ${trip.delivery.status === 'disputed' ? 'Снять спор и подтвердить получение' : 'Подтвердить получение груза'}
        </button>
        ${trip.delivery.status !== 'disputed' ? '<button type="button" class="btn btn-danger-outline btn-lg" id="toggleDisputeBtn">Есть расхождение</button>' : ''}
      </div>
      ${appState.showDisputeForm ? `
        <form id="disputeForm" class="inline-panel form-stack">
          <label class="field">
            <span>Причина расхождения (заблокирует расчёт)</span>
            <textarea name="disputeReason" rows="2" required placeholder="Например: Повреждена обрешётка одного места оборудования">Повреждена обрешётка одного места оборудования</textarea>
          </label>
          <div class="btn-row">
            <button type="submit" class="btn btn-danger-outline btn-sm">Зафиксировать расхождение</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancelDisputeBtn">Отмена</button>
          </div>
        </form>` : ''}
    `);
  }

  if (actions.upload) body.push(renderUploadBlock(doc));

  if (actions.review) {
    body.push(`
      <div class="inline-panel form-stack">
        <div class="panel-title">Проверка накладной v${doc.version}: ${esc(doc.fileName)}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-success" id="acceptDocBtn" data-doc-id="${esc(doc.id)}">Принять документ</button>
          <button type="button" class="btn btn-danger-outline" id="toggleReturnDocBtn">Вернуть с замечанием</button>
        </div>
        ${appState.showReturnDocForm ? `
          <form id="returnDocForm" class="form-stack" data-doc-id="${esc(doc.id)}">
            <label class="field">
              <span>Конкретное замечание перевозчику</span>
              <input type="text" name="comment" required value="На второй странице накладной не видна подпись" />
            </label>
            <div class="btn-row">
              <button type="submit" class="btn btn-danger-outline btn-sm">Отправить замечание</button>
              <button type="button" class="btn btn-secondary btn-sm" id="cancelReturnDocBtn">Отмена</button>
            </div>
          </form>` : ''}
      </div>
    `);
  }

  if (actions.export) {
    body.push(`
      <div class="btn-row">
        <button type="button" class="btn btn-primary btn-lg" id="export1cBtn" ${appState.exportInFlight ? 'disabled' : ''}>
          ${ICON.download}
          ${exported ? 'Скачать выгрузку повторно' : 'Скачать выгрузку для 1С (демо)'}
        </button>
      </div>
    `);
  }

  if (!hasPrimaryAction(actions)) {
    const ownerRole = s.ownerRole;
    const ownerPerson = appState.roles.find((r) => r.id === ownerRole);
    const canSwitch = !exported && ownerRole !== role && ownerPerson;
    body.push(`
      <div class="waiting-box">
        <span>${exported ? 'Рейс завершён, действий не требуется.' : `От вас ничего не требуется. Сейчас ход у: <strong>${esc(s.ownerLabel)}</strong>.`}</span>
        ${canSwitch ? `<button type="button" class="btn btn-secondary btn-sm" data-switch-role="${esc(ownerRole)}">Показать глазами роли «${esc(ownerPerson.label)}» </button>` : ''}
      </div>
    `);
  }

  // Второстепенные действия, которые роль может сделать в любой момент
  const secondary = [];
  if (actions.disputeLate) {
    secondary.push('<button type="button" class="btn-link danger" id="toggleDisputeBtn">Отметить расхождение</button>');
  }
  if (secondary.length) body.push(`<div class="secondary-actions">${secondary.join('')}</div>`);
  if (actions.disputeLate && appState.showDisputeForm) {
    body.push(`
      <form id="disputeForm" class="inline-panel form-stack">
        <label class="field">
          <span>Причина расхождения (заблокирует расчёт)</span>
          <textarea name="disputeReason" rows="2" required>Повреждена обрешётка одного места оборудования</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-danger-outline btn-sm">Зафиксировать расхождение</button>
          <button type="button" class="btn btn-secondary btn-sm" id="cancelDisputeBtn">Отмена</button>
        </div>
      </form>
    `);
  }

  const eyebrow = mine
    ? '<span class="badge accent plain">Ваш ход</span>'
    : exported
      ? '<span class="badge success">Завершено</span>'
      : `<span class="badge neutral plain">Ход: ${esc(s.ownerLabel)}</span>`;

  return `
    <section class="action-card tone-${esc(nar.tone)} ${mine ? 'mine' : 'waiting'}" aria-label="Что делать сейчас">
      <div class="action-head">
        <div>
          <div class="action-eyebrow">Что делать сейчас ${eyebrow}</div>
          <h2 class="action-title">${esc(nar.title)}</h2>
          <p class="action-text">${nar.text}</p>
          ${nar.extra || ''}
        </div>
      </div>
      <div class="action-body">${body.join('')}</div>
    </section>
  `;
}

function renderProposePanel(trip) {
  const latest = trip.versions[trip.versions.length - 1];
  return `
    <form id="proposeTermsForm" class="card form-stack">
      <div class="card-header" style="margin-bottom:0">
        <div>
          <h3 class="card-title">Предложить изменение условий</h3>
          <p class="card-desc">Создаст версию v${latest.version + 1}. Она вступит в силу только после подтверждения перевозчика.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="quickShift14Btn">Быстро: 14:00</button>
      </div>
      <div class="form-grid-3">
        <label class="field">
          <span>Дата погрузки</span>
          <input type="date" name="loadingDate" required value="${esc(latest.loadingDate)}" />
        </label>
        <label class="field">
          <span>Новое время погрузки</span>
          <input type="time" name="loadingTime" id="proposeTimeInput" required value="${latest.loadingTime === '10:00' ? '14:00' : esc(latest.loadingTime)}" />
        </label>
        <label class="field">
          <span>Ставка, ₽</span>
          <input type="number" name="rateRub" required min="1000" step="500" value="${esc(latest.rateRub)}" />
        </label>
      </div>
      <label class="field">
        <span>Комментарий к изменению</span>
        <input type="text" name="note" value="Склад перенёс окно отгрузки" placeholder="Например: Склад перенёс окно отгрузки" />
      </label>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Отправить перевозчику</button>
        <button type="button" class="btn btn-secondary" id="cancelProposeBtn">Отмена</button>
      </div>
    </form>
  `;
}

function renderTermsCard(trip) {
  const role = appState.roleId;
  const versions = [...trip.versions].reverse();
  const currentId = trip.summary.confirmedVersion?.id;
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Условия и история версий</h3>
          <p class="card-desc">Каждое изменение — новая версия. Согласованные условия не перезаписываются.</p>
        </div>
      </div>
      <ul class="version-list">
        ${versions.map((v) => `
          <li class="version-item ${v.id === currentId ? 'current' : ''} ${v.status === 'superseded' ? 'superseded' : ''}">
            <span class="version-tag num">v${v.version}</span>
            <div class="version-main">
              <div class="version-line num">
                ${esc(formatDateRu(v.loadingDate))}, <strong>${esc(v.loadingTime)}</strong>
                <span class="muted"> · ${role === 'accountant' && v.status !== 'confirmed' ? 'ставка не передана в расчёт' : esc(formatRub(v.rateRub))}</span>
              </div>
              <div class="version-note">${esc(v.proposedByName)} · ${esc(v.note || 'без комментария')} · ${esc(formatTimestamp(v.proposedAt))}</div>
            </div>
            <div class="version-status">
              ${renderVersionStatusBadge(v.status)}
              ${v.confirmedAt ? `<small>${esc(v.confirmedByName)} · ${esc(formatTimestamp(v.confirmedAt))}</small>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

function renderDocsCard(trip) {
  const docs = [...trip.documents].reverse();
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Транспортная накладная</h3>
          <p class="card-desc">Перевозчик прикладывает, логист или бухгалтер принимает либо возвращает с замечанием.</p>
        </div>
        <span class="badge ${trip.summary.latestDoc?.status === 'accepted' ? 'success' : trip.summary.latestDoc?.status === 'returned' ? 'danger' : trip.summary.latestDoc ? 'info' : 'neutral'}">${esc(trip.summary.docStatusLabel)}</span>
      </div>
      ${docs.length ? `
        <ul class="version-list">
          ${docs.map((d) => `
            <li class="version-item ${d.id === trip.summary.latestDoc?.id ? 'current' : 'superseded'}">
              <span class="version-tag num">v${d.version}</span>
              <div class="version-main">
                <div class="version-line">${esc(d.fileName)}</div>
                <div class="version-note">Загружена ${esc(formatTimestamp(d.uploadedAt))}</div>
                ${d.reviewComment ? `<div class="doc-comment">«${esc(d.reviewComment)}»${d.reviewedBy ? ` — ${esc(d.reviewedBy)}` : ''}</div>` : ''}
              </div>
              <div class="version-status">${renderDocStatusBadge(d.status)}</div>
            </li>
          `).join('')}
        </ul>
      ` : '<div class="alert-box">Накладная ещё не приложена.</div>'}
    </section>
  `;
}

function checklistItem(ok, bad, text) {
  const cls = bad ? 'bad' : ok ? 'ok' : '';
  return `<li class="${cls}"><span class="check-mark">${bad ? ICON.cross : ICON.check}</span><span>${esc(text)}</span></li>`;
}

function renderSideCards(trip) {
  const s = trip.summary;
  const role = appState.roleId;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;
  const latest = trip.versions[trip.versions.length - 1];
  const doc = s.latestDoc;
  const integrityResult = appState.integrityResultByTrip[trip.id] || null;
  const disputed = trip.delivery.status === 'disputed';

  const rateNote = pending && confirmed && pending.rateRub !== confirmed.rateRub
    ? (role === 'accountant' ? 'Неподтверждённая ставка скрыта от расчёта' : `Предложено ${formatRub(pending.rateRub)} · не подтверждено`)
    : confirmed
      ? 'Подтверждена обеими сторонами'
      : `Предложено логистом: ${formatRub(latest.rateRub)}`;

  const timeValue = confirmed
    ? `${formatDateRu(confirmed.loadingDate)}, ${confirmed.loadingTime}`
    : `${formatDateRu(latest.loadingDate)}, ${latest.loadingTime}`;

  const facts = `
    <section class="card">
      <div class="fact-hero">
        <div class="label">Ставка (согласовано)</div>
        <div class="value num">${confirmed ? esc(formatRub(confirmed.rateRub)) : 'Не согласована'}</div>
        <div class="note">${esc(rateNote)}</div>
      </div>
      <dl class="facts">
        <div class="fact"><dt>Погрузка</dt><dd class="num">${esc(timeValue)}${confirmed ? '' : ' · ожидает'}</dd></div>
        <div class="fact"><dt>Перевозчик</dt><dd>${esc(trip.carrierName)}</dd></div>
        <div class="fact"><dt>Получатель</dt><dd>${esc(trip.receiverName)}</dd></div>
        <div class="fact"><dt>Грузоотправитель</dt><dd>${esc(trip.shipperName)}</dd></div>
      </dl>
    </section>
  `;

  const termsOk = Boolean(confirmed) && !pending;
  const deliveryOk = trip.delivery.status === 'confirmed';
  const docOk = doc?.status === 'accepted';
  const exportRec = trip.accounting.exportRecord;

  const checklist = `
    <section class="card">
      <div class="card-header" style="margin-bottom:12px">
        <div>
          <h3 class="card-title">Готовность к расчёту</h3>
          <p class="card-desc">${esc(s.settlement.label)}</p>
        </div>
        ${s.settlement.ready ? '<span class="badge success">Можно выгружать</span>' : disputed ? '<span class="badge danger">Заблокирован</span>' : ''}
      </div>
      <ul class="checklist">
        ${checklistItem(termsOk, false, 'Условия подтверждены перевозчиком')}
        ${checklistItem(deliveryOk, disputed, disputed ? `Спор: ${trip.delivery.disputeReason}` : 'Получатель подтвердил приёмку')}
        ${checklistItem(docOk, doc?.status === 'returned', doc?.status === 'returned' ? 'Накладная возвращена на исправление' : 'Накладная принята')}
        ${checklistItem(Boolean(exportRec), false, exportRec ? `Выгружено · ${exportRec.dispatchNumber}` : 'Выгрузка для 1С сформирована')}
      </ul>
      ${exportRec ? `
        <div class="alert-box success" style="margin-top:14px">
          Файл: ${esc(exportRec.fileName)}
          <small>${esc(exportRec.demoLabel)} · ${esc(formatTimestamp(exportRec.createdAt))}</small>
        </div>` : ''}
    </section>
  `;

  const integrity = `
    <section class="card">
      <details class="disclosure" style="border-top:0" ${integrityResult ? 'open' : ''}>
        <summary style="padding-top:0">Контроль целостности (SHA-256)</summary>
        <div class="disclosure-body">
          <p class="card-desc">Локальная проверка: показывает, изменилось ли содержимое файла условий. Блокчейн-реестр, банк и живая 1С — следующий этап.</p>
          ${confirmed ? `
            <div class="hash-box">
              <div class="hash-label">Эталон v${confirmed.version} (${esc(confirmed.loadingTime)}, ${esc(formatRub(confirmed.rateRub))})</div>
              <div class="mono">${esc(confirmed.sha256)}</div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn btn-secondary btn-sm verify-sample-btn" data-variant="original">Исходный файл</button>
              <button type="button" class="btn btn-secondary btn-sm verify-sample-btn" data-variant="tampered">Изменённый файл</button>
            </div>
            <label class="field">
              <span>Или любой локальный файл</span>
              <input type="file" id="integrityFileInput" />
            </label>
            ${integrityResult ? `
              <div class="alert-box ${integrityResult.match ? 'success' : 'danger'}">
                <strong>${esc(integrityResult.statusLabel)}</strong>
                <small>${esc(integrityResult.diffSummary)}</small>
                <small><b>Файл:</b> ${esc(integrityResult.checkedFileName)}</small>
                <small><b>Эталон v${integrityResult.confirmedVersionNumber}:</b> <span class="mono">${esc(integrityResult.expectedHash)}</span></small>
                <small><b>Проверяемый:</b> <span class="mono">${esc(integrityResult.actualHash)}</span></small>
              </div>` : ''}
          ` : '<div class="alert-box">Контрольная сумма появится после подтверждения условий перевозчиком.</div>'}
        </div>
      </details>
    </section>
  `;

  const events = [...trip.history].reverse();
  const timelineHtml = (list) => `
    <ul class="timeline">
      ${list.map((ev) => `
        <li class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <div class="timeline-title">${esc(ev.title)}</div>
            <div class="timeline-detail">${esc(ev.detail)}</div>
            <div class="timeline-meta">${esc(formatTimestamp(ev.at))} · ${esc(ev.actorName)}</div>
          </div>
        </li>`).join('')}
    </ul>`;

  const history = `
    <section class="card">
      <div class="card-header" style="margin-bottom:12px">
        <div>
          <h3 class="card-title">История событий</h3>
          <p class="card-desc">Всего событий: ${events.length}</p>
        </div>
      </div>
      ${timelineHtml(events.slice(0, 4))}
      ${events.length > 4 ? `
        <details class="disclosure" style="margin-top:14px">
          <summary>Показать всю историю</summary>
          <div class="disclosure-body">${timelineHtml(events.slice(4))}</div>
        </details>` : ''}
    </section>
  `;

  return checklist + integrity + history;
}


function buildStamp(trip) {
  const s = trip.summary;
  const doc = s.latestDoc;
  let title = 'К расчёту';
  let tone = 'green';
  if (trip.accounting.exportRecord) { title = 'Выгружено в 1С'; tone = 'blue'; }
  else if (trip.delivery.status === 'disputed') { title = 'Спор'; tone = 'red'; }
  else if (s.pendingVersion) { title = 'Согласование'; tone = 'blue'; }
  else if (doc && doc.status === 'returned') { title = 'Возврат'; tone = 'red'; }
  else if (doc && doc.status === 'submitted') { title = 'На проверке'; tone = 'blue'; }
  else if (trip.delivery.status !== 'confirmed') { title = 'Ждём приёмку'; tone = 'blue'; }
  else if (!doc) { title = 'Ждём накладную'; tone = 'blue'; }
  const last = trip.history[trip.history.length - 1];
  return { title, tone, date: last ? formatTimestamp(last.at) : '' };
}

function renderSheet(trip) {
  const s = trip.summary;
  const role = appState.roleId;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;
  const latest = trip.versions[trip.versions.length - 1];
  const stamp = buildStamp(trip);
  const stampKey = `${trip.id}:${stamp.title}`;
  const hit = appState.lastStampKey !== stampKey;
  appState.lastStampKey = stampKey;

  const timeMain = confirmed
    ? `${formatDateRu(confirmed.loadingDate)}, ${confirmed.loadingTime}`
    : `${formatDateRu(latest.loadingDate)}, ${latest.loadingTime}`;
  const timeSub = pending && confirmed
    ? `Предложено: ${confirmed.loadingTime} → ${pending.loadingTime}`
    : confirmed
      ? `Согласована версия v${confirmed.version}`
      : 'Ждём подтверждения перевозчика';
  const rateMain = confirmed ? formatRub(confirmed.rateRub) : 'Не согласована';
  const rateSub = pending && confirmed && pending.rateRub !== confirmed.rateRub
    ? (role === 'accountant' ? 'Неподтверждённая ставка скрыта от расчёта' : `Предложено ${formatRub(pending.rateRub)}, не подтверждено`)
    : confirmed
      ? 'Подтверждена обеими сторонами'
      : `Предложено логистом: ${formatRub(latest.rateRub)}`;

  return `
    <article class="sheet">
      <div class="sheet-head">
        <div class="sheet-no">
          <span>Рейс № ${esc(trip.number)}</span>
          <span class="sheet-tag">${trip.isDemo ? 'Демо-рейс' : 'Создан вручную'}</span>
        </div>
      </div>
      <div class="stamp ${esc(stamp.tone)} ${hit ? 'hit' : ''}" aria-label="Статус рейса: ${esc(stamp.title)}">
        <div class="stamp-title">${esc(stamp.title)}</div>
        <div class="stamp-date">${esc(stamp.date)}</div>
      </div>
      <h2 class="sheet-route">${esc(trip.origin)}<span class="sep">—</span>${esc(trip.destination)}</h2>
      <div class="sheet-cargo">${esc(trip.cargo)}</div>
      ${role === 'logist' && !trip.accounting.exportRecord ? `
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="toggleProposeBtn">
            ${appState.showProposeForm ? 'Скрыть форму правки' : 'Изменить время и условия'}
          </button>
        </div>` : ''}
      <dl class="fields">
        <div class="field-cell"><dt>Погрузка</dt><dd class="num">${esc(timeMain)}</dd><div class="sub">${esc(timeSub)}</div></div>
        <div class="field-cell"><dt>Ставка</dt><dd class="amount">${esc(rateMain)}</dd><div class="sub">${esc(rateSub)}</div></div>
        <div class="field-cell"><dt>Перевозчик</dt><dd>${esc(trip.carrierName)}</dd><div class="sub">Накладная: ${esc(s.docStatusLabel).toLowerCase()}</div></div>
        <div class="field-cell"><dt>Получатель</dt><dd>${esc(trip.receiverName)}</dd><div class="sub">Отправитель: ${esc(trip.shipperName)}</div></div>
      </dl>
      ${renderStepper(trip)}
    </article>
  `;
}

function renderTripDetail() {
  const trip = getSelectedTrip();
  if (!trip) {
    els.emptyDetailState.classList.remove('hidden');
    els.tripDetailContent.classList.add('hidden');
    return;
  }

  els.emptyDetailState.classList.add('hidden');
  els.tripDetailContent.classList.remove('hidden');

  const role = appState.roleId;

  els.tripDetailContent.innerHTML = `
    <div class="detail-stack">
      <button type="button" class="btn btn-secondary btn-sm mobile-back-btn" id="mobileBackBtn">← К списку рейсов</button>

      ${renderSheet(trip)}

      <div class="detail-grid">
        <div class="detail-main">
          ${renderActionCard(trip)}
          ${role === 'logist' && appState.showProposeForm ? renderProposePanel(trip) : ''}
          ${renderTermsCard(trip)}
          ${renderDocsCard(trip)}
        </div>
        <aside class="detail-side">
          ${renderSideCards(trip)}
        </aside>
      </div>
    </div>
  `;

  bindDetailEvents(trip);
  document.querySelectorAll('[data-switch-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.switchRole === 'carrier') appState.carrierId = trip.carrierId;
      switchRole(btn.dataset.switchRole, { notice: false });
    });
  });
}

function triggerCsvDownload(fileName, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindDetailEvents(trip) {
  const mobileBackBtn = document.getElementById('mobileBackBtn');
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
      appState.mobileDetailOpen = false;
      renderAll();
    });
  }

  const toggleProposeBtn = document.getElementById('toggleProposeBtn');
  if (toggleProposeBtn) {
    toggleProposeBtn.addEventListener('click', () => {
      appState.showProposeForm = !appState.showProposeForm;
      renderTripDetail();
    });
  }

  const cancelProposeBtn = document.getElementById('cancelProposeBtn');
  if (cancelProposeBtn) {
    cancelProposeBtn.addEventListener('click', () => {
      appState.showProposeForm = false;
      renderTripDetail();
    });
  }

  const quickShift14Btn = document.getElementById('quickShift14Btn');
  if (quickShift14Btn) {
    quickShift14Btn.addEventListener('click', () => {
      const timeInput = document.getElementById('proposeTimeInput');
      if (timeInput) timeInput.value = '14:00';
    });
  }

  const proposeTermsForm = document.getElementById('proposeTermsForm');
  if (proposeTermsForm) {
    proposeTermsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(proposeTermsForm);
      try {
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/propose`, {
          method: 'POST',
          body: JSON.stringify({
            loadingDate: fd.get('loadingDate'),
            loadingTime: fd.get('loadingTime'),
            rateRub: Number(fd.get('rateRub')),
            note: fd.get('note'),
          }),
        });
        appState.showProposeForm = false;
        showToast('Предложение изменения отправлено перевозчику на подтверждение.', 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const confirmPendingBtn = document.getElementById('confirmPendingBtn');
  if (confirmPendingBtn) {
    confirmPendingBtn.addEventListener('click', async () => {
      const versionId = confirmPendingBtn.dataset.versionId;
      try {
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/confirm`, {
          method: 'POST',
          body: JSON.stringify({ versionId, roleId: appState.roleId, carrierId: appState.carrierId }),
        });
        delete appState.integrityResultByTrip[trip.id];
        showToast('Новые условия подтверждены. История версий и SHA-256 обновлены.', 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
        await loadState({ keepSelection: true });
      }
    });
  }

  const confirmDeliveryBtn = document.getElementById('confirmDeliveryBtn');
  if (confirmDeliveryBtn) {
    confirmDeliveryBtn.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/delivery`, {
          method: 'POST',
          body: JSON.stringify({ action: 'confirm' }),
        });
        appState.showDisputeForm = false;
        showToast('Получение груза подтверждено.', 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const toggleDisputeBtn = document.getElementById('toggleDisputeBtn');
  if (toggleDisputeBtn) {
    toggleDisputeBtn.addEventListener('click', () => {
      appState.showDisputeForm = !appState.showDisputeForm;
      renderTripDetail();
    });
  }

  const cancelDisputeBtn = document.getElementById('cancelDisputeBtn');
  if (cancelDisputeBtn) {
    cancelDisputeBtn.addEventListener('click', () => {
      appState.showDisputeForm = false;
      renderTripDetail();
    });
  }

  const disputeForm = document.getElementById('disputeForm');
  if (disputeForm) {
    disputeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(disputeForm);
      try {
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/delivery`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'dispute',
            disputeReason: fd.get('disputeReason'),
          }),
        });
        appState.showDisputeForm = false;
        showToast('Расхождение зафиксировано. Рейс переведён в статус «На ручной проверке».', 'info');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  document.querySelectorAll('.preset-doc-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            presetId: btn.dataset.presetId,
            roleId: appState.roleId,
            carrierId: appState.carrierId,
          }),
        });
        showToast('Накладная приложена и отправлена на проверку.', 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  const customDocFileInput = document.getElementById('customDocFileInput');
  if (customDocFileInput) {
    customDocFileInput.addEventListener('change', async () => {
      const file = customDocFileInput.files?.[0];
      if (!file) return;
      try {
        const contentBase64 = await readFileAsBase64(file);
        await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            contentBase64,
            roleId: appState.roleId,
            carrierId: appState.carrierId,
          }),
        });
        showToast(`Файл «${file.name}» приложен и отправлен на проверку.`, 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const acceptDocBtn = document.getElementById('acceptDocBtn');
  if (acceptDocBtn) {
    acceptDocBtn.addEventListener('click', async () => {
      try {
        await apiFetch(
          `/api/trips/${encodeURIComponent(trip.id)}/documents/${encodeURIComponent(acceptDocBtn.dataset.docId)}/review`,
          {
            method: 'POST',
            body: JSON.stringify({ decision: 'accept', reviewerRole: appState.roleId }),
          }
        );
        appState.showReturnDocForm = false;
        showToast('Комплект принят.', 'success');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const toggleReturnDocBtn = document.getElementById('toggleReturnDocBtn');
  if (toggleReturnDocBtn) {
    toggleReturnDocBtn.addEventListener('click', () => {
      appState.showReturnDocForm = !appState.showReturnDocForm;
      renderTripDetail();
    });
  }

  const cancelReturnDocBtn = document.getElementById('cancelReturnDocBtn');
  if (cancelReturnDocBtn) {
    cancelReturnDocBtn.addEventListener('click', () => {
      appState.showReturnDocForm = false;
      renderTripDetail();
    });
  }

  const returnDocForm = document.getElementById('returnDocForm');
  if (returnDocForm) {
    returnDocForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(returnDocForm);
      try {
        await apiFetch(
          `/api/trips/${encodeURIComponent(trip.id)}/documents/${encodeURIComponent(returnDocForm.dataset.docId)}/review`,
          {
            method: 'POST',
            body: JSON.stringify({
              decision: 'return',
              comment: fd.get('comment'),
              reviewerRole: appState.roleId,
            }),
          }
        );
        appState.showReturnDocForm = false;
        showToast('Накладная возвращена перевозчику с замечанием.', 'info');
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const export1cBtn = document.getElementById('export1cBtn');
  if (export1cBtn) {
    export1cBtn.addEventListener('click', async () => {
      if (appState.exportInFlight) return;
      appState.exportInFlight = true;
      export1cBtn.disabled = true;
      try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/accounting/export`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        triggerCsvDownload(res.record.fileName, res.csvContent);
        if (res.created) {
          showToast(`Создано распоряжение ${res.record.dispatchNumber} и скачан файл сверки для 1С (демо).`, 'success');
        } else {
          showToast(`Распоряжение ${res.record.dispatchNumber} уже сформировано — повторно скачан тот же файл без создания дубля.`, 'info');
        }
        await loadState({ keepSelection: true });
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        appState.exportInFlight = false;
      }
    });
  }

  document.querySelectorAll('.verify-sample-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/integrity/verify`, {
          method: 'POST',
          body: JSON.stringify({ variant: btn.dataset.variant }),
        });
        appState.integrityResultByTrip[trip.id] = res;
        renderTripDetail();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  const integrityFileInput = document.getElementById('integrityFileInput');
  if (integrityFileInput) {
    integrityFileInput.addEventListener('change', async () => {
      const file = integrityFileInput.files?.[0];
      if (!file) return;
      try {
        const contentBase64 = await readFileAsBase64(file);
        const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/integrity/verify`, {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, contentBase64 }),
        });
        appState.integrityResultByTrip[trip.id] = res;
        renderTripDetail();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

// Modal controls
function openCreateModal() {
  els.createTripModal.classList.remove('hidden');
}

function closeCreateModal() {
  els.createTripModal.classList.add('hidden');
}

els.openCreateModalBtn.addEventListener('click', openCreateModal);
els.closeCreateModalBtn.addEventListener('click', closeCreateModal);
els.cancelCreateModalBtn.addEventListener('click', closeCreateModal);
els.createTripModal.addEventListener('click', (e) => {
  if (e.target === els.createTripModal) closeCreateModal();
});

els.createTripForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(els.createTripForm);
  try {
    const res = await apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        origin: fd.get('origin'),
        destination: fd.get('destination'),
        cargo: fd.get('cargo'),
        loadingDate: fd.get('loadingDate'),
        loadingTime: fd.get('loadingTime'),
        rateRub: Number(fd.get('rateRub')),
        carrierId: fd.get('carrierId'),
        receiverName: fd.get('receiverName'),
      }),
    });
    closeCreateModal();
    els.createTripForm.reset();
    appState.selectedTripId = res.trip.id;
    appState.mobileDetailOpen = true;
    showToast(`Создан рейс ${res.trip.number}. Приглашение отправлено перевозчику.`, 'success');
    await loadState({ keepSelection: true });
  } catch (err) {
    showToast(err.message, 'error');
  }
});

els.resetDemoBtn.addEventListener('click', async () => {
  try {
    await apiFetch('/api/demo/reset', { method: 'POST', body: JSON.stringify({}) });
    delete appState.integrityResultByTrip['trip-demo-7684'];
    appState.selectedTripId = 'trip-demo-7684';
    appState.showProposeForm = false;
    appState.showDisputeForm = false;
    appState.showReturnDocForm = false;
    showToast('Демонстрационный рейс Р-2026-041 возвращён в исходное состояние (10:00). Ручные рейсы сохранены.', 'success');
    await loadState({ keepSelection: true });
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Boot
loadViewPrefs();
loadState({ keepSelection: true }).catch((err) => {
  showToast(`Не удалось загрузить данные: ${err.message}`, 'error');
});
