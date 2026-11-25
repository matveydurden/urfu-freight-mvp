// Добавляет в работающее приложение набор вымышленных рейсов во всех состояниях.
// Идемпотентно: рейс с тем же грузом повторно не создаётся.
//   BASE_URL=http://127.0.0.1:4173 node scripts/seed-demo.mjs
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const GROMOV = 'carrier-gromov';
const URAL = 'carrier-uraltrans';

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error || res.status}`);
  return data;
}

function dateInDays(n) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

const SCENARIOS = [
  { cargo: 'Подшипники, 1,2 т (тест)', to: 'Челябинск', rate: 18500, carrier: GROMOV, days: 2, time: '09:00', steps: [] },
  { cargo: 'Станочная оснастка, 2,4 т (тест)', to: 'Тюмень', rate: 32000, carrier: GROMOV, days: 3, time: '11:30', steps: ['confirm'] },
  { cargo: 'Кабельная продукция, 4 т (тест)', to: 'Новосибирск', rate: 74000, carrier: URAL, days: 4, time: '08:00', steps: ['confirm', 'deliver'] },
  { cargo: 'Крепёж и метизы, 900 кг (тест)', to: 'Самара', rate: 27000, carrier: GROMOV, days: 2, time: '13:00', steps: ['confirm', 'deliver', 'upload-bad'] },
  { cargo: 'Листовой металл, 6 т (тест)', to: 'Уфа', rate: 41000, carrier: URAL, days: 5, time: '07:30', steps: ['confirm', 'deliver', 'upload-bad', 'return'] },
  { cargo: 'Запчасти для пресса, 1,8 т (тест)', to: 'Омск', rate: 55000, carrier: GROMOV, days: 6, time: '10:15', steps: ['confirm', 'dispute'] },
  { cargo: 'Лакокрасочные материалы, 3 т (тест)', to: 'Курган', rate: 23500, carrier: URAL, days: 3, time: '12:00', steps: ['confirm', 'deliver', 'upload-ok', 'accept'] },
  { cargo: 'Промышленное оборудование, 5 т (тест)', to: 'Пермь', rate: 36000, carrier: GROMOV, days: 1, time: '15:00', steps: ['confirm', 'deliver', 'upload-ok', 'accept', 'export'] },
  { cargo: 'Электродвигатели, 2,1 т (тест)', to: 'Нижний Тагил', rate: 15000, carrier: GROMOV, days: 2, time: '09:30', steps: ['confirm', 'change-time'] },
];

async function main() {
  const existing = (await api('GET', '/api/state?role=logist')).trips;
  let created = 0;
  for (const sc of SCENARIOS) {
    if (existing.some((t) => t.cargo === sc.cargo)) continue;
    let { trip } = await api('POST', '/api/trips', {
      origin: 'Екатеринбург',
      destination: sc.to,
      cargo: sc.cargo,
      loadingDate: dateInDays(sc.days),
      loadingTime: sc.time,
      rateRub: sc.rate,
      carrierId: sc.carrier,
      receiverName: `Склад получателя (${sc.to})`,
    });
    const id = trip.id;
    for (const step of sc.steps) {
      if (step === 'confirm') {
        ({ trip } = await api('POST', `/api/trips/${id}/confirm`, { versionId: trip.versions[0].id, roleId: 'carrier', carrierId: sc.carrier }));
      } else if (step === 'deliver') {
        ({ trip } = await api('POST', `/api/trips/${id}/delivery`, { action: 'confirm' }));
      } else if (step === 'dispute') {
        ({ trip } = await api('POST', `/api/trips/${id}/delivery`, { action: 'dispute', disputeReason: 'Повреждена упаковка одного места' }));
      } else if (step === 'upload-bad' || step === 'upload-ok') {
        ({ trip } = await api('POST', `/api/trips/${id}/documents`, {
          presetId: step === 'upload-bad' ? 'tn_missing_signature' : 'tn_signed_complete',
          roleId: 'carrier',
          carrierId: sc.carrier,
        }));
      } else if (step === 'return') {
        const doc = trip.documents[trip.documents.length - 1];
        ({ trip } = await api('POST', `/api/trips/${id}/documents/${doc.id}/review`, { decision: 'return', comment: 'На второй странице накладной не видна подпись', reviewerRole: 'logist' }));
      } else if (step === 'accept') {
        const doc = trip.documents[trip.documents.length - 1];
        ({ trip } = await api('POST', `/api/trips/${id}/documents/${doc.id}/review`, { decision: 'accept', reviewerRole: 'accountant' }));
      } else if (step === 'export') {
        ({ trip } = await api('POST', `/api/trips/${id}/accounting/export`)).trip;
      } else if (step === 'change-time') {
        ({ trip } = await api('POST', `/api/trips/${id}/propose`, { loadingTime: '16:00', note: 'Склад перенёс окно отгрузки' }));
      }
    }
    created += 1;
    console.log(`+ ${trip.number} ${trip.origin} -> ${trip.destination} [${trip.summary.nextAction}]`);
  }
  console.log(created ? `Добавлено рейсов: ${created}` : 'Тестовые рейсы уже на месте, ничего не добавлено');
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
