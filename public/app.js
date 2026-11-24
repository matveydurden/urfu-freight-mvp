const appState = {
  roleId: 'logist',
  roles: [],
  carriers: [],
  demoDocumentPresets: [],
  trips: [],
  selectedTripId: null,
  mobileDetailOpen: false,
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
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const hashRole = params.get('role');
  const hashTrip = params.get('trip');
  const savedRole = hashRole || localStorage.getItem('urfu_freight_role') || 'logist';
  const savedTrip = hashTrip || localStorage.getItem('urfu_freight_trip') || 'trip-demo-7684';
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

async function loadState({ keepSelection = true, switchNotice = false } = {}) {
  const prevTripId = appState.selectedTripId;
  const data = await apiFetch(`/api/state?role=${encodeURIComponent(appState.roleId)}`);
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

function renderTopbar() {
  els.roleSwitcher.innerHTML = appState.roles
    .map(
      (r) => `
      <button
        type="button"
        role="tab"
        aria-selected="${r.id === appState.roleId}"
        class="role-btn ${r.id === appState.roleId ? 'active' : ''}"
        data-role="${esc(r.id)}"
      >
        ${esc(r.label)}
      </button>`
    )
    .join('');

  els.roleSwitcher.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextRole = btn.dataset.role;
      if (nextRole === appState.roleId) return;
      appState.roleId = nextRole;
      appState.showProposeForm = false;
      appState.showDisputeForm = false;
      appState.showReturnDocForm = false;
      await loadState({ keepSelection: true, switchNotice: true });
    });
  });

  const activeRole = appState.roles.find((r) => r.id === appState.roleId);
  if (activeRole) {
    els.roleContextBar.innerHTML = `
      <div>
        Вы вошли как: <span class="role-context-strong">${esc(activeRole.label)} — ${esc(activeRole.person)}</span>
        (${esc(activeRole.org)}) · ${esc(activeRole.hint)}
      </div>
      <div>Переключение роли сохраняет открытую карточку при наличии доступа</div>
    `;
  }

  els.openCreateModalBtn.classList.toggle('hidden', appState.roleId !== 'logist');

  // Populate carrier dropdown in create modal
  els.createCarrierSelect.innerHTML = appState.carriers
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.fleet)}</option>`)
    .join('');
}

function renderTripList() {
  const count = appState.trips.length;
  if (appState.roleId === 'carrier') {
    els.tripListSubtitle.textContent = `Назначенные вам рейсы: ${count}`;
  } else {
    els.tripListSubtitle.textContent = `Всего рейсов: ${count}`;
  }

  if (count === 0) {
    els.tripList.innerHTML = `<div class="empty-state">Рейсов пока нет.</div>`;
    return;
  }

  els.tripList.innerHTML = appState.trips
    .map((trip) => {
      const s = trip.summary;
      const isSelected = trip.id === appState.selectedTripId;
      const shownRate = s.confirmedVersion
        ? formatRub(s.confirmedVersion.rateRub)
        : `${formatRub(trip.versions[0]?.rateRub)} (не согл.)`;
      const shownTime = s.confirmedVersion ? s.confirmedVersion.loadingTime : trip.versions[0]?.loadingTime;
      const pendingMark = s.pendingVersion && s.confirmedVersion
        ? ` · правка ${s.confirmedVersion.loadingTime} → ${s.pendingVersion.loadingTime}`
        : '';

      return `
        <button type="button" class="trip-row ${isSelected ? 'selected' : ''}" data-trip-id="${esc(trip.id)}">
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
            <span class="owner-label">Сейчас: ${esc(s.ownerLabel)}</span>
          </div>
        </button>
      `;
    })
    .join('');

  els.tripList.querySelectorAll('.trip-row').forEach((row) => {
    row.addEventListener('click', () => {
      appState.selectedTripId = row.dataset.tripId;
      appState.mobileDetailOpen = true;
      appState.showProposeForm = false;
      appState.showDisputeForm = false;
      appState.showReturnDocForm = false;
      persistViewPrefs();
      renderAll();
    });
  });
}

function renderVersionStatusBadge(status) {
  if (status === 'confirmed') return '<span class="badge success">Согласована</span>';
  if (status === 'pending') return '<span class="badge warning">Ожидает подтверждения перевозчика</span>';
  return '<span class="badge neutral">Заменена новой</span>';
}

function renderDocStatusBadge(status) {
  if (status === 'accepted') return '<span class="badge success">Комплект принят</span>';
  if (status === 'returned') return '<span class="badge danger">Исправить накладную</span>';
  return '<span class="badge info">На проверке</span>';
}

function renderActionBanner(trip) {
  const s = trip.summary;
  const role = appState.roleId;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;

  // 1. Dispute takes top priority
  if (trip.delivery.status === 'disputed') {
    return `
      <div class="action-banner danger">
        <div>
          <div class="action-banner-title">На ручной проверке — зафиксирован спор при приёмке</div>
          <div class="action-banner-text">
            Причина: <strong>${esc(trip.delivery.disputeReason)}</strong>. Расчёт и выгрузка в 1С заблокированы до урегулирования.
          </div>
        </div>
        <span class="badge danger">Расчёт заблокирован</span>
      </div>
    `;
  }

  // 2. Pending version change (central feature!)
  if (pending) {
    const timeChanged = confirmed && confirmed.loadingTime !== pending.loadingTime;
    const dateChanged = confirmed && confirmed.loadingDate !== pending.loadingDate;
    const rateChanged = confirmed && confirmed.rateRub !== pending.rateRub;

    let diffHtml = '';
    if (confirmed) {
      const parts = [];
      if (timeChanged) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(confirmed.loadingTime)}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(pending.loadingTime)}</span></span>`);
      }
      if (dateChanged) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(formatDateRu(confirmed.loadingDate))}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(formatDateRu(pending.loadingDate))}</span></span>`);
      }
      if (rateChanged) {
        parts.push(`<span class="diff-pill num"><span class="diff-old">${esc(formatRub(confirmed.rateRub))}</span><span class="diff-arrow">→</span><span class="diff-new">${esc(formatRub(pending.rateRub))}</span></span>`);
      }
      diffHtml = `<div class="btn-row">${parts.join('')}</div>`;
    } else {
      diffHtml = `<div class="action-banner-text">Исходные условия v1: погрузка ${esc(formatDateRu(pending.loadingDate))} в <strong>${esc(pending.loadingTime)}</strong>, ставка <strong>${esc(formatRub(pending.rateRub))}</strong>.</div>`;
    }

    const confirmBtnLabel = confirmed && timeChanged
      ? `Подтвердить ${pending.loadingTime}`
      : confirmed
        ? `Подтвердить v${pending.version}`
        : `Принять условия (${pending.loadingTime})`;

    const carrierAction = role === 'carrier'
      ? `<button type="button" class="btn btn-primary btn-lg" id="confirmPendingBtn" data-version-id="${esc(pending.id)}">${esc(confirmBtnLabel)}</button>`
      : `<span class="badge warning">Ждём перевозчика</span>`;

    const accountantWarning = role === 'accountant'
      ? `<div class="action-banner-text" style="margin-top:6px;"><strong>Для бухгалтерии:</strong> неподтверждённая правка v${pending.version} в расчёт не передана. Актуальная согласованная ставка: ${confirmed ? formatRub(confirmed.rateRub) : 'ещё не согласована'}.</div>`
      : '';

    return `
      <div class="action-banner warning">
        <div>
          <div class="action-banner-title">Ожидает подтверждения перевозчика (версия v${pending.version})</div>
          ${diffHtml}
          <div class="action-banner-text">
            Автор изменения: ${esc(pending.proposedByName)}${pending.note ? ` · «${esc(pending.note)}»` : ''}
          </div>
          ${accountantWarning}
        </div>
        <div>${carrierAction}</div>
      </div>
    `;
  }

  // 3. Returned document
  if (s.latestDoc && s.latestDoc.status === 'returned') {
    return `
      <div class="action-banner danger">
        <div>
          <div class="action-banner-title">Исправить накладную — документ возвращён на доработку</div>
          <div class="action-banner-text">
            Замечание (${esc(s.latestDoc.reviewedBy)}): <strong>«${esc(s.latestDoc.reviewComment)}»</strong>
          </div>
        </div>
        <span class="badge danger">Ответственный: ${esc(trip.carrierName)}</span>
      </div>
    `;
  }

  // 4. Ready for settlement
  if (s.settlement.ready) {
    return `
      <div class="action-banner success">
        <div>
          <div class="action-banner-title">Готов к расчёту — все условия и документы согласованы</div>
          <div class="action-banner-text">
            Принята версия v${confirmed.version} (${esc(confirmed.loadingTime)}, ${esc(formatRub(confirmed.rateRub))}), доставка подтверждена, комплект принят.
          </div>
        </div>
        <span class="badge success">${trip.accounting.exportRecord ? `Выгружено (${esc(trip.accounting.exportRecord.dispatchNumber)})` : 'Готов к расчёту'}</span>
      </div>
    `;
  }

  // 5. Normal next step
  return `
    <div class="action-banner info">
      <div>
        <div class="action-banner-title">Следующее действие: ${esc(s.nextAction)}</div>
        <div class="action-banner-text">
          Ответственный сейчас: <strong>${esc(s.ownerLabel)}</strong>.
          ${confirmed ? `Согласована версия v${confirmed.version}: погрузка ${esc(formatDateRu(confirmed.loadingDate))} в ${esc(confirmed.loadingTime)}, ставка ${esc(formatRub(confirmed.rateRub))}.` : ''}
        </div>
      </div>
      <span class="badge ${esc(s.nextActionTone)}">${esc(s.nextAction)}</span>
    </div>
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

  const s = trip.summary;
  const role = appState.roleId;
  const confirmed = s.confirmedVersion;
  const pending = s.pendingVersion;
  const latest = trip.versions[trip.versions.length - 1];
  const latestDoc = s.latestDoc;

  // Displayed KPI values: Accountant strictly sees ONLY confirmed values
  const kpiTime = confirmed
    ? `${formatDateRu(confirmed.loadingDate)}, ${confirmed.loadingTime}`
    : `${formatDateRu(latest.loadingDate)}, ${latest.loadingTime} (ожидает)`;
  const kpiTimeNote = pending && confirmed
    ? `Предложено: ${confirmed.loadingTime} → ${pending.loadingTime}`
    : confirmed
      ? `Согласована версия v${confirmed.version}`
      : 'Ждём подтверждения перевозчика';

  const kpiRate = confirmed ? formatRub(confirmed.rateRub) : 'Не согласована';
  const kpiRateNote = pending && confirmed && pending.rateRub !== confirmed.rateRub
    ? (role === 'accountant'
      ? 'Неподтверждённая ставка скрыта от расчёта'
      : `Предложено: ${formatRub(pending.rateRub)} (не подтв.)`)
    : confirmed
      ? 'Подтверждена обеими сторонами'
      : `Предложено логистом: ${formatRub(latest.rateRub)}`;

  const integrityResult = appState.integrityResultByTrip[trip.id] || null;

  els.tripDetailContent.innerHTML = `
    <button type="button" class="btn btn-secondary btn-sm mobile-back-btn" id="mobileBackBtn">← К списку рейсов</button>

    <!-- HERO SUMMARY -->
    <div class="card">
      <div class="hero-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span class="badge neutral num">${esc(trip.number)}</span>
            ${trip.isDemo ? '<span class="badge warning">Демо-рейс</span>' : '<span class="badge neutral">Создан вручную</span>'}
            <span class="badge ${esc(s.nextActionTone)}">${esc(s.nextAction)}</span>
          </div>
          <h2 class="hero-route">${esc(trip.origin)} → ${esc(trip.destination)}</h2>
          <div class="hero-sub">${esc(trip.cargo)} · Грузоотправитель: ${esc(trip.shipperName)} · Получатель: ${esc(trip.receiverName)}</div>
        </div>
        ${role === 'logist' ? `
          <div class="btn-row">
            <button type="button" class="btn btn-primary btn-sm" id="toggleProposeBtn">
              ${appState.showProposeForm ? 'Скрыть форму правки' : 'Изменить время / условия'}
            </button>
          </div>
        ` : ''}
      </div>

      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">Погрузка (согласовано)</div>
          <div class="kpi-value num">${esc(kpiTime)}</div>
          <div class="kpi-note">${esc(kpiTimeNote)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Ставка</div>
          <div class="kpi-value num">${esc(kpiRate)}</div>
          <div class="kpi-note">${esc(kpiRateNote)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Перевозчик</div>
          <div class="kpi-value">${esc(trip.carrierName)}</div>
          <div class="kpi-note">Документы: ${esc(s.docStatusLabel)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Ответственный сейчас</div>
          <div class="kpi-value">${esc(s.ownerLabel)}</div>
          <div class="kpi-note">${esc(s.settlement.label)}</div>
        </div>
      </div>

      ${renderActionBanner(trip)}
    </div>

    <!-- TERMS & VERSIONS -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Условия и история версий</h3>
          <p class="card-desc">Каждое изменение сохраняется как новая версия. Прежние согласованные условия не перезаписываются.</p>
        </div>
      </div>

      ${role === 'logist' && appState.showProposeForm ? `
        <form id="proposeTermsForm" class="inline-panel form-stack">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong>Предложить изменение условий (создаст v${latest.version + 1})</strong>
            <button type="button" class="btn btn-secondary btn-sm" id="quickShift14Btn">Быстро: перенести на 14:00</button>
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
            <button type="submit" class="btn btn-primary btn-sm">Отправить перевозчику на подтверждение</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancelProposeBtn">Отмена</button>
          </div>
        </form>
      ` : ''}

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Версия</th>
              <th>Дата и время</th>
              <th>Ставка</th>
              <th>Автор и комментарий</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${[...trip.versions].reverse().map((v) => `
              <tr>
                <td class="num"><strong>v${v.version}</strong></td>
                <td class="num">${esc(formatDateRu(v.loadingDate))}, <strong>${esc(v.loadingTime)}</strong></td>
                <td class="num">${role === 'accountant' && v.status !== 'confirmed' ? '<span style="color:var(--text-muted)">Не передана в расчёт</span>' : esc(formatRub(v.rateRub))}</td>
                <td>
                  <div>${esc(v.proposedByName)}</div>
                  <div style="font-size:12px;color:var(--text-muted);">${esc(v.note || '—')} · ${esc(formatTimestamp(v.proposedAt))}</div>
                </td>
                <td>
                  ${renderVersionStatusBadge(v.status)}
                  ${v.confirmedAt ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Подтвердил: ${esc(v.confirmedByName)} (${esc(formatTimestamp(v.confirmedAt))})</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- DELIVERY & DOCUMENTS -->
    <div class="section-grid-2">
      <!-- Delivery Acceptance -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Приёмка груза</h3>
            <p class="card-desc">Факт доставки подтверждает уполномоченный получатель (${esc(trip.receiverName)}).</p>
          </div>
          ${trip.delivery.status === 'confirmed'
            ? '<span class="badge success">Груз получен</span>'
            : trip.delivery.status === 'disputed'
              ? '<span class="badge danger">Спор при приёмке</span>'
              : '<span class="badge neutral">Ожидает разгрузки</span>'}
        </div>

        ${trip.delivery.status === 'confirmed' ? `
          <div class="alert-box success">
            Получение груза подтверждено без расхождений.<br/>
            <span style="font-size:12px;">${esc(trip.delivery.updatedBy)} · ${esc(formatTimestamp(trip.delivery.updatedAt))}</span>
          </div>
        ` : ''}

        ${trip.delivery.status === 'disputed' ? `
          <div class="alert-box danger">
            <strong>Зафиксировано расхождение:</strong> ${esc(trip.delivery.disputeReason)}<br/>
            <span style="font-size:12px;">${esc(trip.delivery.updatedBy)} · ${esc(formatTimestamp(trip.delivery.updatedAt))}</span>
          </div>
        ` : ''}

        ${role === 'receiver' ? `
          <div class="btn-row" style="margin-bottom:10px;">
            <button type="button" class="btn btn-success btn-sm" id="confirmDeliveryBtn">
              ${trip.delivery.status === 'disputed' ? 'Снять спор и подтвердить получение' : 'Подтвердить получение груза'}
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm" id="toggleDisputeBtn">
              Отметить расхождение
            </button>
          </div>

          ${appState.showDisputeForm ? `
            <form id="disputeForm" class="inline-panel form-stack">
              <label class="field">
                <span>Причина расхождения (блокирует расчёт)</span>
                <textarea name="disputeReason" rows="2" required placeholder="Например: Повреждена обрешётка одного места оборудования">Повреждена обрешётка одного места оборудования</textarea>
              </label>
              <div class="btn-row">
                <button type="submit" class="btn btn-danger-outline btn-sm">Зафиксировать расхождение</button>
                <button type="button" class="btn btn-secondary btn-sm" id="cancelDisputeBtn">Отмена</button>
              </div>
            </form>
          ` : ''}
        ` : `
          <div class="alert-box neutral">
            Переключитесь на роль <strong>«Получатель»</strong>, чтобы подтвердить получение груза или отметить расхождение.
          </div>
        `}
      </div>

      <!-- Documents -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Документы (транспортная накладная)</h3>
            <p class="card-desc">Перевозчик прикладывает накладную, ответственный принимает или возвращает с замечанием.</p>
          </div>
          <span class="badge ${latestDoc?.status === 'accepted' ? 'success' : latestDoc?.status === 'returned' ? 'danger' : latestDoc ? 'info' : 'neutral'}">
            ${esc(s.docStatusLabel)}
          </span>
        </div>

        ${latestDoc && latestDoc.status === 'returned' ? `
          <div class="alert-box danger">
            <strong>Накладная v${latestDoc.version} возвращена на исправление:</strong><br/>
            «${esc(latestDoc.reviewComment)}»
            <div style="font-size:12px;margin-top:4px;">Проверил: ${esc(latestDoc.reviewedBy)} · ${esc(formatTimestamp(latestDoc.reviewedAt))}</div>
          </div>
        ` : ''}

        ${role === 'carrier' ? `
          <div class="inline-panel form-stack">
            <div style="font-size:13px;font-weight:600;">
              ${latestDoc?.status === 'returned' ? 'Приложить исправленную версию накладной' : 'Приложить транспортную накладную'}
            </div>
            <div class="btn-row">
              ${appState.demoDocumentPresets.map((p) => `
                <button type="button" class="btn ${latestDoc?.status === 'returned' && p.id === 'tn_signed_complete' ? 'btn-primary' : 'btn-secondary'} btn-sm preset-doc-btn" data-preset-id="${esc(p.id)}">
                  ${esc(p.label)}
                </button>
              `).join('')}
            </div>
            <label class="field" style="margin-top:4px;">
              <span>Или загрузить свой файл (PDF / JPG / TXT)</span>
              <input type="file" id="customDocFileInput" />
            </label>
          </div>
        ` : ''}

        ${(role === 'logist' || role === 'accountant') && latestDoc && latestDoc.status === 'submitted' ? `
          <div class="inline-panel form-stack">
            <div style="font-size:13px;font-weight:600;">Проверка накладной v${latestDoc.version}: ${esc(latestDoc.fileName)}</div>
            <div class="btn-row">
              <button type="button" class="btn btn-success btn-sm" id="acceptDocBtn" data-doc-id="${esc(latestDoc.id)}">Принять документ</button>
              <button type="button" class="btn btn-danger-outline btn-sm" id="toggleReturnDocBtn">Вернуть с замечанием</button>
            </div>
            ${appState.showReturnDocForm ? `
              <form id="returnDocForm" class="form-stack" data-doc-id="${esc(latestDoc.id)}">
                <label class="field">
                  <span>Конкретное замечание перевозчику</span>
                  <input type="text" name="comment" required value="На второй странице накладной не видна подпись" />
                </label>
                <div class="btn-row">
                  <button type="submit" class="btn btn-danger-outline btn-sm">Отправить замечание</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="cancelReturnDocBtn">Отмена</button>
                </div>
              </form>
            ` : ''}
          </div>
        ` : ''}

        ${trip.documents.length > 0 ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Версия</th>
                  <th>Файл</th>
                  <th>Статус и замечание</th>
                </tr>
              </thead>
              <tbody>
                ${[...trip.documents].reverse().map((d) => `
                  <tr>
                    <td class="num"><strong>v${d.version}</strong></td>
                    <td>
                      <div>${esc(d.fileName)}</div>
                      <div style="font-size:11px;color:var(--text-muted);">${esc(formatTimestamp(d.uploadedAt))}</div>
                    </td>
                    <td>
                      ${renderDocStatusBadge(d.status)}
                      ${d.reviewComment ? `<div style="font-size:12px;color:var(--danger);margin-top:4px;">«${esc(d.reviewComment)}»</div>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div style="font-size:13px;color:var(--text-muted);">Документы ещё не приложены.</div>'}
      </div>
    </div>

    <!-- ACCOUNTING & INTEGRITY -->
    <div class="section-grid-2">
      <!-- Accounting / 1C Export -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Расчёт и передача в бухгалтерию</h3>
            <p class="card-desc">Демонстрационная выгрузка для сверки с 1С доступна только при закрытии всех условий без споров.</p>
          </div>
          <span class="badge ${s.settlement.status === 'ready' ? 'success' : s.settlement.status === 'manual_review' ? 'danger' : 'neutral'}">
            ${esc(s.settlement.label)}
          </span>
        </div>

        ${s.settlement.status === 'manual_review' ? `
          <div class="alert-box danger">
            <strong>На ручной проверке.</strong> Причина блокировки: ${esc(s.settlement.disputeReason)}.
            Выгрузка для бухгалтерии заблокирована даже при принятых документах.
          </div>
        ` : !s.settlement.ready ? `
          <div class="alert-box neutral">
            <strong>Почему рейс ещё не готов к расчёту:</strong>
            <ul class="checklist">
              ${s.settlement.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}
            </ul>
          </div>
        ` : `
          <div class="alert-box success">
            <strong>Готов к расчёту.</strong>
            Согласованная ставка: <strong class="num">${esc(formatRub(confirmed.rateRub))}</strong> (версия v${confirmed.version}),
            комплект принят (${esc(latestDoc.fileName)}), доставка подтверждена.
          </div>
        `}

        ${confirmed ? `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
            <div><strong>Согласованная версия:</strong> v${confirmed.version} · Погрузка ${esc(formatDateRu(confirmed.loadingDate))} в ${esc(confirmed.loadingTime)}</div>
            <div><strong>Стороны:</strong> ${esc(trip.shipperName)} → ${esc(trip.carrierName)}</div>
            <div><strong>Сумма к сверке:</strong> <span class="num"><strong>${esc(formatRub(confirmed.rateRub))}</strong></span></div>
          </div>
        ` : ''}

        ${s.settlement.ready ? `
          <div class="btn-row">
            <button type="button" class="btn btn-primary" id="export1cBtn" ${appState.exportInFlight ? 'disabled' : ''}>
              ${trip.accounting.exportRecord ? 'Скачать выгрузку повторно (без дубля)' : 'Скачать выгрузку для 1С (демо)'}
            </button>
          </div>
          ${trip.accounting.exportRecord ? `
            <div class="inline-panel" style="margin-top:12px;margin-bottom:0;font-size:12px;">
              <div><strong>Распоряжение:</strong> <span class="num">${esc(trip.accounting.exportRecord.dispatchNumber)}</span> (повторный клик не создаёт второе распоряжение)</div>
              <div><strong>Файл:</strong> ${esc(trip.accounting.exportRecord.fileName)} · <em>${esc(trip.accounting.exportRecord.demoLabel)}</em></div>
              <div><strong>Сформировано:</strong> ${esc(formatTimestamp(trip.accounting.exportRecord.createdAt))}</div>
            </div>
          ` : ''}
        ` : ''}
      </div>

      <!-- Local SHA-256 Integrity Check -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Контроль целостности (локальный SHA-256)</h3>
            <p class="card-desc">
              Это локальная SHA-256-проверка целостности согласованной версии условий. Она показывает изменение содержимого файла.
              Факт доставки подтверждает получатель. Независимый реестр (блокчейн), банковский перевод и интеграция с живой 1С относятся к следующему этапу.
            </p>
          </div>
        </div>

        ${confirmed ? `
          <div class="hash-box">
            <div class="hash-label">Зафиксированный SHA-256 согласованной версии v${confirmed.version} (${esc(confirmed.loadingTime)}, ${esc(formatRub(confirmed.rateRub))})</div>
            <div class="mono">${esc(confirmed.sha256)}</div>
          </div>

          <div class="btn-row" style="margin-bottom:10px;">
            <button type="button" class="btn btn-secondary btn-sm verify-sample-btn" data-variant="original">
              Проверить исходный демофайл
            </button>
            <button type="button" class="btn btn-secondary btn-sm verify-sample-btn" data-variant="tampered">
              Проверить изменённый демофайл
            </button>
          </div>

          <label class="field" style="margin-bottom:10px;">
            <span>Или проверить произвольный локальный файл</span>
            <input type="file" id="integrityFileInput" />
          </label>

          ${integrityResult ? `
            <div class="alert-box ${integrityResult.match ? 'success' : 'danger'}" style="margin-bottom:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                <strong>Результат: ${esc(integrityResult.statusLabel)}</strong>
                <span class="badge ${integrityResult.match ? 'success' : 'danger'}">${esc(integrityResult.statusLabel)}</span>
              </div>
              <div style="font-size:12px;margin-bottom:6px;">${esc(integrityResult.diffSummary)}</div>
              <div style="font-size:11px;"><strong>Файл:</strong> ${esc(integrityResult.checkedFileName)}</div>
              <div style="font-size:11px;"><strong>Эталон (v${integrityResult.confirmedVersionNumber}):</strong> <span class="mono">${esc(integrityResult.expectedHash)}</span></div>
              <div style="font-size:11px;"><strong>Проверяемый:</strong> <span class="mono">${esc(integrityResult.actualHash)}</span></div>
            </div>
          ` : ''}
        ` : `
          <div class="alert-box neutral">
            Контрольная сумма станет доступна после подтверждения исходных условий перевозчиком.
          </div>
        `}
      </div>
    </div>

    <!-- HISTORY -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">История событий по рейсу</h3>
          <p class="card-desc">Полная хронология согласований, приёмки, документов и выгрузок.</p>
        </div>
      </div>
      <ul class="timeline">
        ${[...trip.history].reverse().map((ev) => `
          <li class="timeline-item">
            <div class="timeline-time num">${esc(formatTimestamp(ev.at))}</div>
            <div>
              <div class="timeline-title">${esc(ev.title)}</div>
              <div class="timeline-detail">${esc(ev.detail)}</div>
              <div class="timeline-actor">${esc(ev.actorName)}</div>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  bindDetailEvents(trip);
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
          body: JSON.stringify({ versionId, roleId: appState.roleId }),
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
