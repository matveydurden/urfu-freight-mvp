import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ROLES = {
  logist: {
    id: 'logist',
    label: 'Логист',
    person: 'Анна Соколова',
    org: 'ООО «УралПромСнаб»',
    hint: 'Создаёт рейсы, меняет условия, проверяет документы',
  },
  carrier: {
    id: 'carrier',
    label: 'Перевозчик',
    person: 'Андрей Громов',
    org: 'ИП Громов А.В.',
    carrierId: 'carrier-gromov',
    hint: 'Видит только свои рейсы, подтверждает условия и загружает накладную',
  },
  receiver: {
    id: 'receiver',
    label: 'Получатель',
    person: 'Дмитрий Волков',
    org: 'ООО «КазаньТехСклад»',
    hint: 'Подтверждает получение груза или фиксирует расхождение',
  },
  accountant: {
    id: 'accountant',
    label: 'Бухгалтер',
    person: 'Елена Морозова',
    org: 'ООО «УралПромСнаб»',
    hint: 'Видит согласованную ставку, проверяет комплект и выгружает сверку для 1С',
  },
};

export const CARRIERS = [
  {
    id: 'carrier-gromov',
    name: 'ИП Громов А.В.',
    fleet: '3 машины (тент 5т, фургон 3т)',
    contact: '+7 (900) 000-41-12 (вымышленный)',
  },
  {
    id: 'carrier-uraltrans',
    name: 'ООО «УралТрансАвто»',
    fleet: '12 машин (тент 10–20т)',
    contact: '+7 (900) 000-78-34 (вымышленный)',
  },
];

export const DEMO_DOCUMENT_PRESETS = {
  tn_missing_signature: {
    id: 'tn_missing_signature',
    fileName: 'ТН_Р-2026-041_скан_v1.pdf',
    label: 'Демо-накладная v1 (без подписи на 2-й стр.)',
    description: 'Подготовленный пример с типовой ошибкой для показа возврата документа',
    content: [
      'ТРАНСПОРТНАЯ НАКЛАДНАЯ (ДЕМОНСТРАЦИОННЫЙ ПРИМЕР)',
      'Рейс: Р-2026-041 | Маршрут: Екатеринбург -> Казань',
      'Грузоотправитель: ООО «УралПромСнаб»',
      'Перевозчик: ИП Громов А.В.',
      'Получатель: ООО «КазаньТехСклад»',
      'Груз: Промышленное оборудование, 2 т',
      'Страница 1: Штамп приёмки присутствует.',
      'Страница 2: [ОБЛАСТЬ ПОДПИСИ НЕ ЧИТАЕТСЯ / СРЕЗАНА ПРИ СКАНИРОВАНИИ]',
    ].join('\n'),
  },
  tn_signed_complete: {
    id: 'tn_signed_complete',
    fileName: 'ТН_Р-2026-041_скан_v2_исправленный.pdf',
    label: 'Демо-накладная v2 (исправленная, с подписью)',
    description: 'Читаемый скан обеих страниц с подписью и печатью получателя',
    content: [
      'ТРАНСПОРТНАЯ НАКЛАДНАЯ (ДЕМОНСТРАЦИОННЫЙ ПРИМЕР)',
      'Рейс: Р-2026-041 | Маршрут: Екатеринбург -> Казань',
      'Грузоотправитель: ООО «УралПромСнаб»',
      'Перевозчик: ИП Громов А.В.',
      'Получатель: ООО «КазаньТехСклад»',
      'Груз: Промышленное оборудование, 2 т',
      'Страница 1: Штамп приёмки присутствует.',
      'Страница 2: Подпись уполномоченного получателя Д. Волкова и печать ООО «КазаньТехСклад» читаются полностью.',
    ].join('\n'),
  },
};

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function buildCanonicalTermsDocument(trip, version) {
  return [
    'СОГЛАСОВАННЫЕ УСЛОВИЯ РЕЙСА (ДЕМОНСТРАЦИОННЫЙ ЭТАЛОН)',
    `Номер рейса: ${trip.number}`,
    `Версия условий: v${version.version}`,
    `Маршрут: ${trip.origin} -> ${trip.destination}`,
    `Груз: ${trip.cargo}`,
    `Грузоотправитель: ${trip.shipperName}`,
    `Перевозчик: ${trip.carrierName}`,
    `Получатель: ${trip.receiverName}`,
    `Дата погрузки: ${version.loadingDate}`,
    `Время погрузки: ${version.loadingTime}`,
    `Согласованная ставка: ${version.rateRub} RUB`,
    `Автор версии: ${version.proposedByName}`,
  ].join('\n');
}

export function buildTamperedTermsDocument(trip, version) {
  const alteredRate = Number(version.rateRub) + 3500;
  return [
    'СОГЛАСОВАННЫЕ УСЛОВИЯ РЕЙСА (ДЕМОНСТРАЦИОННЫЙ ЭТАЛОН)',
    `Номер рейса: ${trip.number}`,
    `Версия условий: v${version.version}`,
    `Маршрут: ${trip.origin} -> ${trip.destination}`,
    `Груз: ${trip.cargo}`,
    `Грузоотправитель: ${trip.shipperName}`,
    `Перевозчик: ${trip.carrierName}`,
    `Получатель: ${trip.receiverName}`,
    `Дата погрузки: ${version.loadingDate}`,
    `Время погрузки: ${version.loadingTime}`,
    `Согласованная ставка: ${alteredRate} RUB`,
    `Автор версии: ${version.proposedByName}`,
  ].join('\n');
}

function makeDemoPrimaryTrip() {
  const baseTrip = {
    id: 'trip-demo-7684',
    number: 'Р-2026-041',
    isDemo: true,
    origin: 'Екатеринбург',
    destination: 'Казань',
    cargo: 'Промышленное оборудование, 2 т',
    shipperName: 'ООО «УралПромСнаб»',
    carrierId: 'carrier-gromov',
    carrierName: 'ИП Громов А.В.',
    receiverName: 'ООО «КазаньТехСклад»',
    createdAt: '2026-11-24T08:15:00+05:00',
    versions: [],
    delivery: {
      status: 'pending', // 'pending' | 'confirmed' | 'disputed'
      updatedAt: null,
      updatedBy: null,
      disputeReason: '',
    },
    documents: [],
    accounting: {
      exportRecord: null,
    },
    history: [],
  };

  const v1 = {
    id: 'ver-demo-1',
    version: 1,
    loadingDate: '2026-11-26',
    loadingTime: '10:00',
    rateRub: 45000,
    note: 'Исходные условия рейса, согласованы при назначении',
    status: 'confirmed', // 'pending' | 'confirmed' | 'superseded'
    proposedAt: '2026-11-24T08:15:00+05:00',
    proposedByRole: 'logist',
    proposedByName: 'Анна Соколова (Логист)',
    confirmedAt: '2026-11-24T08:42:00+05:00',
    confirmedByRole: 'carrier',
    confirmedByName: 'ИП Громов А.В.',
    sha256: '',
  };
  v1.sha256 = sha256Hex(buildCanonicalTermsDocument(baseTrip, v1));
  baseTrip.versions.push(v1);

  baseTrip.history.push(
    {
      id: 'evt-demo-1',
      at: '2026-11-24T08:15:00+05:00',
      actorRole: 'logist',
      actorName: 'Анна Соколова (Логист)',
      kind: 'trip_created',
      title: 'Создан рейс Р-2026-041 и приглашён перевозчик',
      detail: 'Екатеринбург → Казань, 2 т оборудования, погрузка 26.11.2026 в 10:00, ставка 45 000 ₽. Назначен ИП Громов А.В.',
    },
    {
      id: 'evt-demo-2',
      at: '2026-11-24T08:42:00+05:00',
      actorRole: 'carrier',
      actorName: 'ИП Громов А.В.',
      kind: 'terms_confirmed',
      title: 'Перевозчик подтвердил исходные условия (v1)',
      detail: 'Погрузка 26.11.2026 в 10:00, ставка 45 000 ₽. Контрольная сумма SHA-256 зафиксирована.',
    }
  );

  return baseTrip;
}

function makeDemoSecondaryTrip() {
  const baseTrip = {
    id: 'trip-demo-other',
    number: 'Р-2026-042',
    isDemo: true,
    origin: 'Екатеринбург',
    destination: 'Пермь',
    cargo: 'Металлоконструкции, 4,5 т',
    shipperName: 'ООО «УралПромСнаб»',
    carrierId: 'carrier-uraltrans',
    carrierName: 'ООО «УралТрансАвто»',
    receiverName: 'ООО «ПрикамьеСтрой»',
    createdAt: '2026-11-23T14:20:00+05:00',
    versions: [],
    delivery: {
      status: 'confirmed',
      updatedAt: '2026-11-24T12:10:00+05:00',
      updatedBy: 'Уполномоченный получатель (ООО «ПрикамьеСтрой»)',
      disputeReason: '',
    },
    documents: [],
    accounting: {
      exportRecord: null,
    },
    history: [],
  };

  const v1 = {
    id: 'ver-other-1',
    version: 1,
    loadingDate: '2026-11-24',
    loadingTime: '09:00',
    rateRub: 32000,
    note: 'Стандартная подача на склад № 2',
    status: 'confirmed',
    proposedAt: '2026-11-23T14:20:00+05:00',
    proposedByRole: 'logist',
    proposedByName: 'Анна Соколова (Логист)',
    confirmedAt: '2026-11-23T15:05:00+05:00',
    confirmedByRole: 'carrier',
    confirmedByName: 'ООО «УралТрансАвто»',
    sha256: '',
  };
  v1.sha256 = sha256Hex(buildCanonicalTermsDocument(baseTrip, v1));
  baseTrip.versions.push(v1);

  baseTrip.documents.push({
    id: 'doc-other-1',
    version: 1,
    fileName: 'ТН_Р-2026-042_оригинал.pdf',
    uploadedAt: '2026-11-24T13:00:00+05:00',
    uploadedBy: 'ООО «УралТрансАвто»',
    status: 'accepted',
    reviewComment: '',
    reviewedAt: '2026-11-24T13:30:00+05:00',
    reviewedBy: 'Елена Морозова (Бухгалтер)',
    sha256: sha256Hex('ТН_Р-2026-042_оригинал.pdf::ООО УралТрансАвто::32000'),
  });

  baseTrip.history.push(
    {
      id: 'evt-other-1',
      at: '2026-11-23T14:20:00+05:00',
      actorRole: 'logist',
      actorName: 'Анна Соколова (Логист)',
      kind: 'trip_created',
      title: 'Создан рейс Р-2026-042',
      detail: 'Екатеринбург → Пермь, 4,5 т, погрузка 09:00, ставка 32 000 ₽. Назначен ООО «УралТрансАвто».',
    },
    {
      id: 'evt-other-2',
      at: '2026-11-23T15:05:00+05:00',
      actorRole: 'carrier',
      actorName: 'ООО «УралТрансАвто»',
      kind: 'terms_confirmed',
      title: 'Перевозчик подтвердил условия (v1)',
      detail: 'Погрузка 09:00, ставка 32 000 ₽.',
    },
    {
      id: 'evt-other-3',
      at: '2026-11-24T12:10:00+05:00',
      actorRole: 'receiver',
      actorName: 'Уполномоченный получатель',
      kind: 'delivery_confirmed',
      title: 'Получение груза подтверждено',
      detail: 'Разгрузка в Перми без замечаний.',
    },
    {
      id: 'evt-other-4',
      at: '2026-11-24T13:30:00+05:00',
      actorRole: 'accountant',
      actorName: 'Елена Морозова (Бухгалтер)',
      kind: 'doc_accepted',
      title: 'Комплект принят',
      detail: 'Накладная ТН_Р-2026-042_оригинал.pdf проверена. Рейс готов к расчёту.',
    }
  );

  return baseTrip;
}

export function getConfirmedVersion(trip) {
  const confirmed = trip.versions.filter((v) => v.status === 'confirmed');
  return confirmed.length ? confirmed[confirmed.length - 1] : null;
}

export function getPendingVersion(trip) {
  const pending = trip.versions.filter((v) => v.status === 'pending');
  return pending.length ? pending[pending.length - 1] : null;
}

export function getLatestDocument(trip) {
  return trip.documents.length ? trip.documents[trip.documents.length - 1] : null;
}

export function computeTripSummary(trip) {
  const confirmedVersion = getConfirmedVersion(trip);
  const pendingVersion = getPendingVersion(trip);
  const latestDoc = getLatestDocument(trip);

  const blockers = [];
  if (!confirmedVersion) {
    blockers.push('Исходные условия ещё не подтверждены перевозчиком');
  }
  if (pendingVersion) {
    blockers.push(`Ожидает подтверждения перевозчика (версия v${pendingVersion.version})`);
  }
  if (trip.delivery.status === 'disputed') {
    blockers.push(`Спор при приёмке груза: ${trip.delivery.disputeReason}`);
  } else if (trip.delivery.status !== 'confirmed') {
    blockers.push('Получатель ещё не подтвердил получение груза');
  }

  if (!latestDoc) {
    blockers.push('Перевозчик ещё не приложил транспортную накладную');
  } else if (latestDoc.status === 'returned') {
    blockers.push(`Накладная возвращена на исправление: ${latestDoc.reviewComment}`);
  } else if (latestDoc.status === 'submitted') {
    blockers.push('Накладная загружена и ожидает проверки');
  }

  let settlementStatus = 'waiting';
  let settlementLabel = 'Ожидает закрытия условий';
  if (trip.delivery.status === 'disputed') {
    settlementStatus = 'manual_review';
    settlementLabel = 'На ручной проверке';
  } else if (blockers.length === 0) {
    settlementStatus = 'ready';
    settlementLabel = 'Готов к расчёту';
  }

  // Next action & owner
  let nextAction = 'Готов к расчёту';
  let nextActionTone = 'success';
  let ownerRole = 'accountant';
  let ownerLabel = 'Бухгалтер';

  if (trip.delivery.status === 'disputed') {
    nextAction = 'На ручной проверке';
    nextActionTone = 'danger';
    ownerRole = 'logist';
    ownerLabel = 'Логист и получатель';
  } else if (pendingVersion) {
    nextAction = confirmedVersion ? 'Ждём перевозчика' : 'Ждём подтверждения рейса';
    nextActionTone = 'warning';
    ownerRole = 'carrier';
    ownerLabel = trip.carrierName;
  } else if (latestDoc && latestDoc.status === 'returned') {
    nextAction = 'Исправить накладную';
    nextActionTone = 'danger';
    ownerRole = 'carrier';
    ownerLabel = trip.carrierName;
  } else if (latestDoc && latestDoc.status === 'submitted') {
    nextAction = 'Проверить накладную';
    nextActionTone = 'info';
    ownerRole = 'logist';
    ownerLabel = 'Логист / Бухгалтер';
  } else if (trip.delivery.status !== 'confirmed') {
    nextAction = 'Подтвердить получение груза';
    nextActionTone = 'info';
    ownerRole = 'receiver';
    ownerLabel = trip.receiverName;
  } else if (!latestDoc) {
    nextAction = 'Приложить накладную';
    nextActionTone = 'warning';
    ownerRole = 'carrier';
    ownerLabel = trip.carrierName;
  } else if (trip.accounting.exportRecord) {
    nextAction = 'Выгружено для 1С (демо)';
    nextActionTone = 'success';
    ownerRole = 'accountant';
    ownerLabel = 'Бухгалтер';
  } else {
    nextAction = 'Готов к расчёту';
    nextActionTone = 'success';
    ownerRole = 'accountant';
    ownerLabel = 'Бухгалтер';
  }

  let docStatusLabel = 'Не загружена';
  if (latestDoc) {
    if (latestDoc.status === 'submitted') docStatusLabel = 'На проверке';
    if (latestDoc.status === 'returned') docStatusLabel = 'Исправить накладную';
    if (latestDoc.status === 'accepted') docStatusLabel = 'Комплект принят';
  }

  return {
    confirmedVersion,
    pendingVersion,
    latestDoc,
    docStatusLabel,
    settlement: {
      status: settlementStatus,
      label: settlementLabel,
      ready: settlementStatus === 'ready',
      blockers,
      disputeReason: trip.delivery.status === 'disputed' ? trip.delivery.disputeReason : '',
    },
    nextAction,
    nextActionTone,
    ownerRole,
    ownerLabel,
  };
}

export function buildAccountingCsv(record) {
  const bom = '\uFEFF';
  const rows = [
    ['Поле', 'Значение'],
    ['Назначение файла', 'Демонстрационная выгрузка для сверки с 1С (без интеграции с живой 1С)'],
    ['Номер распоряжения', record.dispatchNumber],
    ['Дата формирования', record.createdAt],
    ['Номер рейса', record.tripNumber],
    ['Маршрут', record.route],
    ['Груз', record.cargo],
    ['Принятая версия условий', `v${record.confirmedVersionNumber}`],
    ['Дата и время погрузки', `${record.loadingDate} ${record.loadingTime}`],
    ['Грузоотправитель', record.shipperName],
    ['Перевозчик', record.carrierName],
    ['Получатель', record.receiverName],
    ['Согласованная сумма (RUB)', String(record.rateRub)],
    ['Статус доставки', 'Подтверждена получателем, спора нет'],
    ['Статус комплекта документов', record.documentStatus],
    ['Принятый документ', record.documentFileName],
    ['Локальный SHA-256 условий', record.sha256],
  ];
  const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;
  return bom + rows.map((r) => r.map(escapeCsv).join(';')).join('\r\n') + '\r\n';
}

export class FreightStore {
  constructor(dataFilePath) {
    this.dataFilePath = dataFilePath;
    this.state = this._loadOrSeed();
  }

  _initialState() {
    return {
      nextTripSeq: 43,
      nextDispatchSeq: 1,
      trips: [makeDemoPrimaryTrip(), makeDemoSecondaryTrip()],
    };
  }

  _loadOrSeed() {
    if (fs.existsSync(this.dataFilePath)) {
      try {
        const raw = fs.readFileSync(this.dataFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.trips)) {
          return parsed;
        }
      } catch {
        // Fallback to fresh seed if corrupted
      }
    }
    const seed = this._initialState();
    this._save(seed);
    return seed;
  }

  _save(state = this.state) {
    const dir = path.dirname(this.dataFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.dataFilePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.dataFilePath);
  }

  _nowIso() {
    return new Date().toISOString();
  }

  _getTripOrThrow(tripId) {
    const trip = this.state.trips.find((t) => t.id === tripId);
    if (!trip) {
      const err = new Error('Рейс не найден');
      err.statusCode = 404;
      throw err;
    }
    return trip;
  }

  _assertRoleCanAccessTrip(trip, roleId) {
    if (roleId === 'carrier' && trip.carrierId !== ROLES.carrier.carrierId) {
      const err = new Error('Этот рейс назначен другому перевозчику');
      err.statusCode = 403;
      throw err;
    }
  }

  _serializeTrip(trip) {
    return {
      ...trip,
      summary: computeTripSummary(trip),
    };
  }

  getStateForRole(roleId = 'logist') {
    const role = ROLES[roleId] || ROLES.logist;
    const visibleTrips = this.state.trips
      .filter((t) => role.id !== 'carrier' || t.carrierId === role.carrierId)
      .map((t) => this._serializeTrip(t));

    return {
      role,
      roles: Object.values(ROLES),
      carriers: CARRIERS,
      demoDocumentPresets: Object.values(DEMO_DOCUMENT_PRESETS).map((p) => ({
        id: p.id,
        fileName: p.fileName,
        label: p.label,
        description: p.description,
      })),
      trips: visibleTrips,
    };
  }

  getTripForRole(tripId, roleId = 'logist') {
    const trip = this._getTripOrThrow(tripId);
    this._assertRoleCanAccessTrip(trip, roleId);
    return this._serializeTrip(trip);
  }

  createTrip({ origin, destination, cargo, loadingDate, loadingTime, rateRub, carrierId, receiverName }) {
    const cleanOrigin = String(origin || '').trim();
    const cleanDestination = String(destination || '').trim();
    const cleanCargo = String(cargo || '').trim();
    const cleanDate = String(loadingDate || '').trim();
    const cleanTime = String(loadingTime || '').trim();
    const numRate = Number(rateRub);
    const carrier = CARRIERS.find((c) => c.id === carrierId);

    if (!cleanOrigin || !cleanDestination) {
      throw Object.assign(new Error('Укажите пункты отправления и назначения'), { statusCode: 400 });
    }
    if (!cleanCargo) {
      throw Object.assign(new Error('Укажите наименование и вес груза'), { statusCode: 400 });
    }
    if (!cleanDate || !cleanTime) {
      throw Object.assign(new Error('Укажите дату и время погрузки'), { statusCode: 400 });
    }
    if (!Number.isFinite(numRate) || numRate <= 0) {
      throw Object.assign(new Error('Укажите корректную ставку в рублях'), { statusCode: 400 });
    }
    if (!carrier) {
      throw Object.assign(new Error('Выберите перевозчика'), { statusCode: 400 });
    }

    const seq = this.state.nextTripSeq++;
    const now = this._nowIso();
    const number = `Р-2026-${String(seq).padStart(3, '0')}`;
    const trip = {
      id: `trip-${Date.now()}-${seq}`,
      number,
      isDemo: false,
      origin: cleanOrigin,
      destination: cleanDestination,
      cargo: cleanCargo,
      shipperName: 'ООО «УралПромСнаб»',
      carrierId: carrier.id,
      carrierName: carrier.name,
      receiverName: String(receiverName || '').trim() || `Склад получателя (${cleanDestination})`,
      createdAt: now,
      versions: [],
      delivery: {
        status: 'pending',
        updatedAt: null,
        updatedBy: null,
        disputeReason: '',
      },
      documents: [],
      accounting: {
        exportRecord: null,
      },
      history: [],
    };

    const v1 = {
      id: `ver-${Date.now()}-1`,
      version: 1,
      loadingDate: cleanDate,
      loadingTime: cleanTime,
      rateRub: Math.round(numRate),
      note: 'Первичное предложение условий',
      status: 'pending',
      proposedAt: now,
      proposedByRole: 'logist',
      proposedByName: `${ROLES.logist.person} (Логист)`,
      confirmedAt: null,
      confirmedByRole: null,
      confirmedByName: null,
      sha256: '',
    };
    v1.sha256 = sha256Hex(buildCanonicalTermsDocument(trip, v1));
    trip.versions.push(v1);

    trip.history.push({
      id: `evt-${Date.now()}-1`,
      at: now,
      actorRole: 'logist',
      actorName: `${ROLES.logist.person} (Логист)`,
      kind: 'trip_created',
      title: `Создан рейс ${number} и отправлено приглашение перевозчику`,
      detail: `${cleanOrigin} → ${cleanDestination}, ${cleanCargo}, погрузка ${cleanDate} в ${cleanTime}, ставка ${Math.round(numRate).toLocaleString('ru-RU')} ₽. Перевозчик: ${carrier.name}.`,
    });

    this.state.trips.unshift(trip);
    this._save();
    return this._serializeTrip(trip);
  }

  proposeTerms(tripId, { loadingDate, loadingTime, rateRub, note }) {
    const trip = this._getTripOrThrow(tripId);
    const latest = trip.versions[trip.versions.length - 1];
    const cleanDate = String(loadingDate || latest.loadingDate).trim();
    const cleanTime = String(loadingTime || latest.loadingTime).trim();
    const numRate = rateRub !== undefined && rateRub !== '' ? Number(rateRub) : latest.rateRub;
    const cleanNote = String(note || '').trim();

    if (!cleanDate || !cleanTime) {
      throw Object.assign(new Error('Укажите дату и время погрузки'), { statusCode: 400 });
    }
    if (!Number.isFinite(numRate) || numRate <= 0) {
      throw Object.assign(new Error('Укажите корректную ставку в рублях'), { statusCode: 400 });
    }

    const baseVersion = getConfirmedVersion(trip) || latest;
    if (
      cleanDate === latest.loadingDate &&
      cleanTime === latest.loadingTime &&
      Math.round(numRate) === latest.rateRub
    ) {
      throw Object.assign(new Error('Новые условия совпадают с последней версией'), { statusCode: 400 });
    }

    const now = this._nowIso();
    // Mark any prior pending version as superseded so stale confirmations fail cleanly
    for (const v of trip.versions) {
      if (v.status === 'pending') {
        v.status = 'superseded';
      }
    }

    const nextNum = latest.version + 1;
    const newVersion = {
      id: `ver-${Date.now()}-${nextNum}`,
      version: nextNum,
      loadingDate: cleanDate,
      loadingTime: cleanTime,
      rateRub: Math.round(numRate),
      note: cleanNote || 'Изменение условий рейса',
      status: 'pending',
      proposedAt: now,
      proposedByRole: 'logist',
      proposedByName: `${ROLES.logist.person} (Логист)`,
      confirmedAt: null,
      confirmedByRole: null,
      confirmedByName: null,
      sha256: '',
    };
    newVersion.sha256 = sha256Hex(buildCanonicalTermsDocument(trip, newVersion));
    trip.versions.push(newVersion);

    const changes = [];
    if (baseVersion.loadingTime !== cleanTime) {
      changes.push(`время погрузки ${baseVersion.loadingTime} → ${cleanTime}`);
    }
    if (baseVersion.loadingDate !== cleanDate) {
      changes.push(`дата погрузки ${baseVersion.loadingDate} → ${cleanDate}`);
    }
    if (baseVersion.rateRub !== Math.round(numRate)) {
      changes.push(`ставка ${baseVersion.rateRub.toLocaleString('ru-RU')} ₽ → ${Math.round(numRate).toLocaleString('ru-RU')} ₽`);
    }

    trip.history.push({
      id: `evt-${Date.now()}-${nextNum}`,
      at: now,
      actorRole: 'logist',
      actorName: `${ROLES.logist.person} (Логист)`,
      kind: 'terms_proposed',
      title: `Предложена версия условий v${nextNum}`,
      detail: `${changes.join('; ') || 'Обновлены условия'}.${cleanNote ? ` Комментарий: ${cleanNote}` : ''} Статус: «Ожидает подтверждения перевозчика».`,
    });

    this._save();
    return this._serializeTrip(trip);
  }

  confirmTerms(tripId, { versionId, roleId = 'carrier' }) {
    const trip = this._getTripOrThrow(tripId);
    this._assertRoleCanAccessTrip(trip, roleId);

    const latest = trip.versions[trip.versions.length - 1];
    const target = trip.versions.find((v) => v.id === versionId);

    if (!target) {
      throw Object.assign(new Error('Указанная версия условий не найдена'), { statusCode: 404 });
    }
    if (target.id !== latest.id || target.status === 'superseded') {
      throw Object.assign(
        new Error('Устаревшее подтверждение отклонено: появилась более свежая версия условий. Проверьте актуальное предложение.'),
        { statusCode: 409 }
      );
    }
    if (target.status === 'confirmed') {
      return this._serializeTrip(trip);
    }

    const now = this._nowIso();
    target.status = 'confirmed';
    target.confirmedAt = now;
    target.confirmedByRole = 'carrier';
    target.confirmedByName = trip.carrierName;
    target.sha256 = sha256Hex(buildCanonicalTermsDocument(trip, target));

    trip.history.push({
      id: `evt-${Date.now()}-conf`,
      at: now,
      actorRole: 'carrier',
      actorName: trip.carrierName,
      kind: 'terms_confirmed',
      title: `Перевозчик подтвердил версию v${target.version}`,
      detail: `Согласованы условия: погрузка ${target.loadingDate} в ${target.loadingTime}, ставка ${target.rateRub.toLocaleString('ru-RU')} ₽.`,
    });

    this._save();
    return this._serializeTrip(trip);
  }

  updateDelivery(tripId, { action, disputeReason }) {
    const trip = this._getTripOrThrow(tripId);
    const now = this._nowIso();

    if (action === 'confirm') {
      trip.delivery = {
        status: 'confirmed',
        updatedAt: now,
        updatedBy: `${ROLES.receiver.person} (${trip.receiverName})`,
        disputeReason: '',
      };
      trip.history.push({
        id: `evt-${Date.now()}-deliv`,
        at: now,
        actorRole: 'receiver',
        actorName: `${ROLES.receiver.person} (Получатель)`,
        kind: 'delivery_confirmed',
        title: 'Получатель подтвердил получение груза',
        detail: `Груз принят в пункте назначения (${trip.destination}) без расхождений.`,
      });
    } else if (action === 'dispute') {
      const reason = String(disputeReason || '').trim();
      if (!reason) {
        throw Object.assign(new Error('Укажите причину расхождения при приёмке'), { statusCode: 400 });
      }
      trip.delivery = {
        status: 'disputed',
        updatedAt: now,
        updatedBy: `${ROLES.receiver.person} (${trip.receiverName})`,
        disputeReason: reason,
      };
      trip.history.push({
        id: `evt-${Date.now()}-dispute`,
        at: now,
        actorRole: 'receiver',
        actorName: `${ROLES.receiver.person} (Получатель)`,
        kind: 'delivery_disputed',
        title: 'Зафиксировано расхождение при приёмке',
        detail: `Причина: ${reason}. Расчёт заблокирован — рейс переведён в статус «На ручной проверке».`,
      });
    } else {
      throw Object.assign(new Error('Некорректное действие приёмки'), { statusCode: 400 });
    }

    this._save();
    return this._serializeTrip(trip);
  }

  uploadDocument(tripId, { presetId, fileName, contentBase64, roleId = 'carrier' }) {
    const trip = this._getTripOrThrow(tripId);
    this._assertRoleCanAccessTrip(trip, roleId);

    let resolvedName = '';
    let contentBuffer = null;

    if (presetId) {
      const preset = DEMO_DOCUMENT_PRESETS[presetId];
      if (!preset) {
        throw Object.assign(new Error('Демо-документ не найден'), { statusCode: 400 });
      }
      resolvedName = preset.fileName;
      contentBuffer = Buffer.from(preset.content, 'utf8');
    } else if (fileName && contentBase64) {
      resolvedName = String(fileName).trim();
      contentBuffer = Buffer.from(String(contentBase64), 'base64');
    } else {
      throw Object.assign(new Error('Выберите подготовленный пример документа или загрузите файл'), { statusCode: 400 });
    }

    const now = this._nowIso();
    const version = trip.documents.length + 1;
    const doc = {
      id: `doc-${Date.now()}-${version}`,
      version,
      fileName: resolvedName,
      sizeBytes: contentBuffer.length,
      uploadedAt: now,
      uploadedBy: trip.carrierName,
      status: 'submitted', // 'submitted' | 'returned' | 'accepted'
      reviewComment: '',
      reviewedAt: null,
      reviewedBy: null,
      sha256: sha256Hex(contentBuffer),
    };

    trip.documents.push(doc);
    trip.history.push({
      id: `evt-${Date.now()}-doc`,
      at: now,
      actorRole: 'carrier',
      actorName: trip.carrierName,
      kind: 'doc_uploaded',
      title: version === 1 ? 'Перевозчик приложил накладную (v1)' : `Перевозчик приложил исправленную накладную (v${version})`,
      detail: `Файл: ${resolvedName}. Отправлено на проверку.`,
    });

    this._save();
    return this._serializeTrip(trip);
  }

  reviewDocument(tripId, docId, { decision, comment, reviewerRole = 'logist' }) {
    const trip = this._getTripOrThrow(tripId);
    const doc = trip.documents.find((d) => d.id === docId);
    if (!doc) {
      throw Object.assign(new Error('Документ не найден'), { statusCode: 404 });
    }
    const latestDoc = getLatestDocument(trip);
    if (latestDoc.id !== doc.id) {
      throw Object.assign(new Error('Можно проверять только актуальную версию документа'), { statusCode: 409 });
    }

    const roleObj = ROLES[reviewerRole] || ROLES.logist;
    const now = this._nowIso();

    if (decision === 'accept') {
      doc.status = 'accepted';
      doc.reviewComment = '';
      doc.reviewedAt = now;
      doc.reviewedBy = `${roleObj.person} (${roleObj.label})`;

      trip.history.push({
        id: `evt-${Date.now()}-doc-ok`,
        at: now,
        actorRole: roleObj.id,
        actorName: `${roleObj.person} (${roleObj.label})`,
        kind: 'doc_accepted',
        title: `Комплект принят (накладная v${doc.version})`,
        detail: `Файл ${doc.fileName} проверен и принят.`,
      });
    } else if (decision === 'return') {
      const reason = String(comment || '').trim();
      if (!reason) {
        throw Object.assign(new Error('Укажите конкретное замечание для возврата документа'), { statusCode: 400 });
      }
      doc.status = 'returned';
      doc.reviewComment = reason;
      doc.reviewedAt = now;
      doc.reviewedBy = `${roleObj.person} (${roleObj.label})`;

      trip.history.push({
        id: `evt-${Date.now()}-doc-ret`,
        at: now,
        actorRole: roleObj.id,
        actorName: `${roleObj.person} (${roleObj.label})`,
        kind: 'doc_returned',
        title: `Накладная v${doc.version} возвращена на исправление`,
        detail: `Замечание: «${reason}».`,
      });
    } else {
      throw Object.assign(new Error('Некорректное решение по документу'), { statusCode: 400 });
    }

    this._save();
    return this._serializeTrip(trip);
  }

  exportAccounting(tripId) {
    const trip = this._getTripOrThrow(tripId);
    const summary = computeTripSummary(trip);

    if (!summary.settlement.ready) {
      throw Object.assign(
        new Error(`Выгрузка недоступна: ${summary.settlement.blockers.join('; ')}`),
        { statusCode: 400 }
      );
    }

    const confirmed = summary.confirmedVersion;
    const acceptedDoc = summary.latestDoc;
    const idempotencyKey = `${trip.id}:v${confirmed.version}:doc${acceptedDoc.version}`;

    if (trip.accounting.exportRecord && trip.accounting.exportRecord.idempotencyKey === idempotencyKey) {
      return {
        created: false,
        record: trip.accounting.exportRecord,
        csvContent: buildAccountingCsv(trip.accounting.exportRecord),
        trip: this._serializeTrip(trip),
      };
    }

    const seq = this.state.nextDispatchSeq++;
    const now = this._nowIso();
    const record = {
      dispatchNumber: `РСП-7684-${String(seq).padStart(3, '0')}`,
      idempotencyKey,
      createdAt: now,
      tripId: trip.id,
      tripNumber: trip.number,
      route: `${trip.origin} → ${trip.destination}`,
      cargo: trip.cargo,
      shipperName: trip.shipperName,
      carrierName: trip.carrierName,
      receiverName: trip.receiverName,
      confirmedVersionNumber: confirmed.version,
      loadingDate: confirmed.loadingDate,
      loadingTime: confirmed.loadingTime,
      rateRub: confirmed.rateRub,
      documentStatus: 'Комплект принят',
      documentFileName: acceptedDoc.fileName,
      sha256: confirmed.sha256,
      fileName: `sverka_1c_demo_${trip.number}_v${confirmed.version}.csv`,
      demoLabel: 'Демонстрационная выгрузка для сверки с 1С',
    };

    trip.accounting.exportRecord = record;
    trip.history.push({
      id: `evt-${Date.now()}-acc`,
      at: now,
      actorRole: 'accountant',
      actorName: `${ROLES.accountant.person} (Бухгалтер)`,
      kind: 'accounting_exported',
      title: `Сформирована демо-выгрузка для 1С (${record.dispatchNumber})`,
      detail: `Версия условий v${confirmed.version}, согласованная сумма ${confirmed.rateRub.toLocaleString('ru-RU')} ₽, комплект принят.`,
    });

    this._save();
    return {
      created: true,
      record,
      csvContent: buildAccountingCsv(record),
      trip: this._serializeTrip(trip),
    };
  }

  verifyIntegrity(tripId, { variant, fileName, contentBase64 }) {
    const trip = this._getTripOrThrow(tripId);
    const confirmed = getConfirmedVersion(trip);
    if (!confirmed) {
      throw Object.assign(new Error('Нет согласованной версии условий для проверки контрольной суммы'), {
        statusCode: 400,
      });
    }

    const expectedContent = buildCanonicalTermsDocument(trip, confirmed);
    const expectedHash = sha256Hex(expectedContent);

    let actualBuffer;
    let checkedFileName;
    let diffSummary = '';

    if (variant === 'original') {
      actualBuffer = Buffer.from(expectedContent, 'utf8');
      checkedFileName = `etalon_${trip.number}_v${confirmed.version}_original.txt`;
    } else if (variant === 'tampered') {
      const tampered = buildTamperedTermsDocument(trip, confirmed);
      actualBuffer = Buffer.from(tampered, 'utf8');
      checkedFileName = `etalon_${trip.number}_v${confirmed.version}_izmenen.txt`;
      diffSummary = `В изменённом файле подменена ставка: ${(confirmed.rateRub + 3500).toLocaleString('ru-RU')} ₽ вместо согласованных ${confirmed.rateRub.toLocaleString('ru-RU')} ₽.`;
    } else if (contentBase64) {
      actualBuffer = Buffer.from(String(contentBase64), 'base64');
      checkedFileName = String(fileName || 'uploaded_file.txt');
    } else {
      throw Object.assign(new Error('Выберите демофайл или загрузите файл для проверки'), { statusCode: 400 });
    }

    const actualHash = sha256Hex(actualBuffer);
    const match = actualHash === expectedHash;

    return {
      match,
      statusLabel: match ? 'Совпадает' : 'Файл отличается',
      checkedFileName,
      confirmedVersionNumber: confirmed.version,
      expectedHash,
      actualHash,
      diffSummary: match
        ? 'Содержимое файла полностью совпадает с зафиксированной версией согласованных условий.'
        : diffSummary || 'Контрольная сумма SHA-256 не совпадает с эталонной согласованной версией.',
    };
  }

  getIntegritySample(tripId, variant = 'original') {
    const trip = this._getTripOrThrow(tripId);
    const confirmed = getConfirmedVersion(trip);
    if (!confirmed) {
      throw Object.assign(new Error('Нет согласованной версии условий'), { statusCode: 400 });
    }
    const content =
      variant === 'tampered'
        ? buildTamperedTermsDocument(trip, confirmed)
        : buildCanonicalTermsDocument(trip, confirmed);
    const fileName =
      variant === 'tampered'
        ? `etalon_${trip.number}_v${confirmed.version}_izmenen.txt`
        : `etalon_${trip.number}_v${confirmed.version}_original.txt`;
    return {
      fileName,
      content,
      sha256: sha256Hex(content),
    };
  }

  resetDemoTrip() {
    const freshDemo = makeDemoPrimaryTrip();
    const idx = this.state.trips.findIndex((t) => t.id === 'trip-demo-7684');
    if (idx >= 0) {
      this.state.trips[idx] = freshDemo;
    } else {
      this.state.trips.unshift(freshDemo);
    }
    // Preserve all manually created trips (!t.isDemo) and other trips
    this._save();
    return this._serializeTrip(freshDemo);
  }
}
