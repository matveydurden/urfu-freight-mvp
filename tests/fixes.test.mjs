import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FreightStore } from '../src/store.mjs';
import { createAppServer } from '../server.mjs';

const FIXED_NOW = new Date('2026-11-25T08:00:00Z');

function withStore(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfu-freight-fix-'));
  const store = new FreightStore(path.join(tmpDir, 'state.json'), { clock: () => FIXED_NOW });
  try {
    fn(store);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function newTrip(store, overrides = {}) {
  return store.createTrip({
    origin: 'Екатеринбург',
    destination: 'Пермь',
    cargo: 'Запчасти, 1 т',
    loadingDate: '2026-12-01',
    loadingTime: '10:00',
    rateRub: 30000,
    carrierId: 'carrier-gromov',
    ...overrides,
  });
}

function readyTrip(store, overrides = {}) {
  const trip = newTrip(store, overrides);
  const carrierId = trip.carrierId;
  store.confirmTerms(trip.id, { versionId: trip.versions[0].id, roleId: 'carrier', carrierId });
  store.updateDelivery(trip.id, { action: 'confirm' });
  const withDoc = store.uploadDocument(trip.id, { presetId: 'tn_signed_complete', roleId: 'carrier', carrierId });
  store.reviewDocument(trip.id, withDoc.documents[0].id, { decision: 'accept', reviewerRole: 'logist' });
  return trip.id;
}

test('Рейс второго перевозчика не зависает: он видит рейс, подтверждает условия и грузит накладную', () => {
  withStore((store) => {
    const trip = newTrip(store, { carrierId: 'carrier-uraltrans' });

    const ural = store.getStateForRole('carrier', { carrierId: 'carrier-uraltrans' });
    assert.ok(ural.trips.some((t) => t.id === trip.id), 'УралТрансАвто должен видеть свой рейс');

    const gromov = store.getStateForRole('carrier');
    assert.ok(!gromov.trips.some((t) => t.id === trip.id), 'ИП Громов не должен видеть чужой рейс');

    assert.throws(
      () => store.confirmTerms(trip.id, { versionId: trip.versions[0].id, roleId: 'carrier' }),
      (err) => err.statusCode === 403
    );

    const confirmed = store.confirmTerms(trip.id, {
      versionId: trip.versions[0].id,
      roleId: 'carrier',
      carrierId: 'carrier-uraltrans',
    });
    assert.equal(confirmed.summary.confirmedVersion.version, 1);

    const withDoc = store.uploadDocument(trip.id, {
      presetId: 'tn_signed_complete',
      roleId: 'carrier',
      carrierId: 'carrier-uraltrans',
    });
    assert.equal(withDoc.documents.length, 1);
  });
});

test('Неизвестный перевозчик отклоняется', () => {
  withStore((store) => {
    assert.throws(
      () => store.getStateForRole('carrier', { carrierId: 'carrier-ghost' }),
      (err) => err.statusCode === 400
    );
  });
});

test('Проверка накладной: нельзя принять возвращённую, принятую повторно, и нельзя проверять от имени перевозчика', () => {
  withStore((store) => {
    const trip = newTrip(store);
    store.confirmTerms(trip.id, { versionId: trip.versions[0].id, roleId: 'carrier' });
    const up = store.uploadDocument(trip.id, { presetId: 'tn_missing_signature', roleId: 'carrier' });
    const doc = up.documents[0];

    assert.throws(
      () => store.reviewDocument(trip.id, doc.id, { decision: 'accept', reviewerRole: 'carrier' }),
      (err) => err.statusCode === 403
    );
    assert.throws(
      () => store.reviewDocument(trip.id, doc.id, { decision: 'accept', reviewerRole: 'receiver' }),
      (err) => err.statusCode === 403
    );

    store.reviewDocument(trip.id, doc.id, { decision: 'return', comment: 'Нет подписи', reviewerRole: 'logist' });

    assert.throws(
      () => store.reviewDocument(trip.id, doc.id, { decision: 'accept', reviewerRole: 'logist' }),
      (err) => err.statusCode === 409,
      'Возвращённую накладную нельзя принять без новой загрузки'
    );

    const up2 = store.uploadDocument(trip.id, { presetId: 'tn_signed_complete', roleId: 'carrier' });
    const doc2 = up2.documents[1];
    store.reviewDocument(trip.id, doc2.id, { decision: 'accept', reviewerRole: 'accountant' });

    assert.throws(
      () => store.reviewDocument(trip.id, doc2.id, { decision: 'return', comment: 'Передумал', reviewerRole: 'logist' }),
      (err) => err.statusCode === 409,
      'Принятую накладную нельзя вернуть задним числом'
    );
  });
});

test('Накладную нельзя загрузить, пока предыдущая на проверке или уже принята', () => {
  withStore((store) => {
    const trip = newTrip(store);
    store.confirmTerms(trip.id, { versionId: trip.versions[0].id, roleId: 'carrier' });
    store.uploadDocument(trip.id, { presetId: 'tn_missing_signature', roleId: 'carrier' });

    assert.throws(
      () => store.uploadDocument(trip.id, { presetId: 'tn_signed_complete', roleId: 'carrier' }),
      (err) => err.statusCode === 409,
      'Пока документ на проверке, новый загрузить нельзя'
    );

    const doc = store.getTripForRole(trip.id, 'logist').documents[0];
    store.reviewDocument(trip.id, doc.id, { decision: 'accept', reviewerRole: 'logist' });

    assert.throws(
      () => store.uploadDocument(trip.id, { presetId: 'tn_signed_complete', roleId: 'carrier' }),
      (err) => err.statusCode === 409,
      'Поверх принятой накладной загружать нельзя'
    );
  });
});

test('После выгрузки в 1С рейс заморожен: нет новых условий, споров, загрузок и второго распоряжения', () => {
  withStore((store) => {
    const tripId = readyTrip(store);
    const exp1 = store.exportAccounting(tripId);
    assert.equal(exp1.created, true);

    assert.throws(
      () => store.proposeTerms(tripId, { rateRub: 99000, note: 'после оплаты' }),
      (err) => err.statusCode === 409
    );
    assert.throws(
      () => store.updateDelivery(tripId, { action: 'dispute', disputeReason: 'позже' }),
      (err) => err.statusCode === 409
    );
    assert.throws(
      () => store.uploadDocument(tripId, { presetId: 'tn_signed_complete', roleId: 'carrier' }),
      (err) => err.statusCode === 409
    );

    const exp2 = store.exportAccounting(tripId);
    assert.equal(exp2.created, false);
    assert.equal(exp2.record.dispatchNumber, exp1.record.dispatchNumber);

    const trip = store.getTripForRole(tripId, 'logist');
    assert.equal(trip.summary.settlement.status, 'ready', 'статус расчёта не должен ломаться после выгрузки');
  });
});

test('CSV для 1С экранирует формулы (защита от CSV-инъекции)', () => {
  withStore((store) => {
    const tripId = readyTrip(store, {
      cargo: '=HYPERLINK("http://evil","x")',
      receiverName: '+cmd|calc',
    });
    const { csvContent } = store.exportAccounting(tripId);
    const lines = csvContent.split('\r\n');
    const cargoLine = lines.find((l) => l.startsWith('"Груз"'));
    const receiverLine = lines.find((l) => l.startsWith('"Получатель"'));
    assert.match(cargoLine, /;"'=HYPERLINK/);
    assert.match(receiverLine, /;"'\+cmd/);
    assert.doesNotMatch(csvContent, /;"=/);
  });
});

test('Валидация: нереальные даты, время, ставки и слишком длинные тексты отклоняются', () => {
  withStore((store) => {
    const bad = (overrides, label) =>
      assert.throws(() => newTrip(store, overrides), (err) => err.statusCode === 400, label);

    bad({ loadingDate: '2026-02-30' }, 'несуществующая дата');
    bad({ loadingDate: '01.12.2026' }, 'неверный формат даты');
    bad({ loadingDate: '2020-01-01' }, 'дата в прошлом');
    bad({ loadingTime: '99:99' }, 'время 99:99');
    bad({ loadingTime: '24:00' }, 'время 24:00');
    bad({ rateRub: 1e15 }, 'ставка 10^15');
    bad({ rateRub: -5 }, 'отрицательная ставка');
    bad({ cargo: 'x'.repeat(500) }, 'слишком длинное описание груза');
    bad({ receiverName: 'x'.repeat(500) }, 'слишком длинное имя получателя');

    const ok = newTrip(store, { loadingDate: '2026-11-25', loadingTime: '23:59', rateRub: 10000000 });
    assert.equal(ok.versions[0].rateRub, 10000000);

    const trip = newTrip(store);
    assert.throws(() => store.proposeTerms(trip.id, { loadingTime: '99:99' }), (err) => err.statusCode === 400);
    assert.throws(() => store.proposeTerms(trip.id, { loadingDate: '2020-01-01' }), (err) => err.statusCode === 400);
    assert.throws(() => store.proposeTerms(trip.id, { rateRub: 1e15 }), (err) => err.statusCode === 400);
    assert.throws(
      () => store.updateDelivery(trip.id, { action: 'dispute', disputeReason: 'x'.repeat(2000) }),
      (err) => err.statusCode === 400
    );
  });
});

test('Файл выгрузки: имя только из ASCII, а скачивание по HTTP отдаёт 200 с корректным заголовком', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfu-freight-http-'));
  const store = new FreightStore(path.join(tmpDir, 'state.json'), { clock: () => FIXED_NOW });
  const server = createAppServer(store);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const tripId = readyTrip(store);
    const exp = store.exportAccounting(tripId);
    assert.match(exp.record.fileName, /^[\x20-\x7E]+$/, 'имя файла должно быть ASCII, иначе скачивание ломается');
    assert.match(exp.record.fileName, /\.csv$/);

    const res = await fetch(`${base}/api/trips/${tripId}/accounting/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="[\x20-\x7E]+\.csv"/);
    const body = await res.text();
    assert.match(body, /Р-2026-/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
