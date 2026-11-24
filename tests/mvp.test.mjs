import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FreightStore } from '../src/store.mjs';

function withTempStore(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfu-freight-test-'));
  const dataFile = path.join(tmpDir, 'state.json');
  const store = new FreightStore(dataFile);
  try {
    fn({ store, dataFile });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('Полный жизненный цикл рейса, изоляция перевозчика, защита от устаревших подтверждений, спор и идемпотентность 1С', () => {
  withTempStore(({ store, dataFile }) => {
    // 1. Роли и изоляция перевозчика
    const logistState = store.getStateForRole('logist');
    assert.equal(logistState.trips.length, 2);

    const carrierState = store.getStateForRole('carrier');
    assert.equal(carrierState.trips.length, 1);
    assert.equal(carrierState.trips[0].id, 'trip-demo-7684');

    assert.throws(
      () => store.getTripForRole('trip-demo-other', 'carrier'),
      (err) => err.statusCode === 403
    );

    // 2. Логист переносит погрузку 10:00 -> 14:00 (v2) с новой ставкой 48 000 ₽
    const tripAfterV2 = store.proposeTerms('trip-demo-7684', {
      loadingDate: '2026-11-26',
      loadingTime: '14:00',
      rateRub: 48000,
      note: 'Окно 14:00',
    });
    const v2 = tripAfterV2.versions.find((v) => v.version === 2);
    assert.equal(v2.status, 'pending');
    // Бухгалтер всё ещё видит подтверждённую ставку v1 (45 000 ₽) и 10:00
    assert.equal(tripAfterV2.summary.confirmedVersion.rateRub, 45000);
    assert.equal(tripAfterV2.summary.confirmedVersion.loadingTime, '10:00');

    // Логист отправляет v3 (14:00, 45 000 ₽) -> v2 становится устаревшей (superseded)
    const tripAfterV3 = store.proposeTerms('trip-demo-7684', {
      loadingDate: '2026-11-26',
      loadingTime: '14:00',
      rateRub: 45000,
      note: 'Финальное окно 14:00',
    });
    const v3 = tripAfterV3.versions.find((v) => v.version === 3);

    // 3. Устаревшее подтверждение v2 должно отклоняться с 409
    assert.throws(
      () => store.confirmTerms('trip-demo-7684', { versionId: v2.id, roleId: 'carrier' }),
      (err) => err.statusCode === 409
    );

    // 4. Подтверждение актуальной версии v3 проходит успешно, v1 (10:00) сохраняется
    const confirmedTrip = store.confirmTerms('trip-demo-7684', { versionId: v3.id, roleId: 'carrier' });
    assert.equal(confirmedTrip.summary.confirmedVersion.loadingTime, '14:00');
    assert.equal(confirmedTrip.versions[0].loadingTime, '10:00');
    assert.equal(confirmedTrip.versions[0].status, 'confirmed');

    // 5. Документы: загрузка v1 -> возврат с замечанием -> загрузка v2 -> принятие
    const afterUpload1 = store.uploadDocument('trip-demo-7684', {
      presetId: 'tn_missing_signature',
      roleId: 'carrier',
    });
    const doc1 = afterUpload1.documents[0];

    const afterReturn1 = store.reviewDocument('trip-demo-7684', doc1.id, {
      decision: 'return',
      comment: 'На второй странице накладной не видна подпись',
      reviewerRole: 'logist',
    });
    assert.equal(afterReturn1.summary.docStatusLabel, 'Исправить накладную');
    assert.equal(afterReturn1.documents[0].reviewComment, 'На второй странице накладной не видна подпись');

    const afterUpload2 = store.uploadDocument('trip-demo-7684', {
      presetId: 'tn_signed_complete',
      roleId: 'carrier',
    });
    const doc2 = afterUpload2.documents[1];

    const afterAccept2 = store.reviewDocument('trip-demo-7684', doc2.id, {
      decision: 'accept',
      reviewerRole: 'accountant',
    });
    assert.equal(afterAccept2.summary.docStatusLabel, 'Комплект принят');

    // 6. Спор при приёмке блокирует расчёт ДАЖЕ при принятых документах
    const disputed = store.updateDelivery('trip-demo-7684', {
      action: 'dispute',
      disputeReason: 'Повреждена упаковка одного места',
    });
    assert.equal(disputed.summary.settlement.status, 'manual_review');
    assert.equal(disputed.summary.settlement.label, 'На ручной проверке');

    assert.throws(
      () => store.exportAccounting('trip-demo-7684'),
      (err) => err.statusCode === 400
    );

    // 7. Подтверждение доставки -> Готов к расчёту -> идемпотентная выгрузка 1С
    const delivered = store.updateDelivery('trip-demo-7684', { action: 'confirm' });
    assert.equal(delivered.summary.settlement.status, 'ready');
    assert.equal(delivered.summary.settlement.label, 'Готов к расчёту');

    const exp1 = store.exportAccounting('trip-demo-7684');
    assert.equal(exp1.created, true);
    assert.match(exp1.csvContent, /Демонстрационная выгрузка для сверки с 1С/);
    assert.match(exp1.csvContent, /Р-2026-041/);
    assert.match(exp1.csvContent, /45000/);

    const exp2 = store.exportAccounting('trip-demo-7684');
    assert.equal(exp2.created, false);
    assert.equal(exp2.record.dispatchNumber, exp1.record.dispatchNumber);

    // 8. Локальная SHA-256 проверка целостности
    const shaOk = store.verifyIntegrity('trip-demo-7684', { variant: 'original' });
    assert.equal(shaOk.match, true);
    assert.equal(shaOk.statusLabel, 'Совпадает');

    const shaBad = store.verifyIntegrity('trip-demo-7684', { variant: 'tampered' });
    assert.equal(shaBad.match, false);
    assert.equal(shaBad.statusLabel, 'Файл отличается');
    assert.notEqual(shaBad.expectedHash, shaBad.actualHash);

    // 9. Создание ручного рейса + сброс демо-рейса сохраняет ручной рейс
    const manual = store.createTrip({
      origin: 'Екатеринбург',
      destination: 'Тюмень',
      cargo: 'Запчасти, 1,2 т',
      loadingDate: '2026-11-28',
      loadingTime: '11:30',
      rateRub: 29000,
      carrierId: 'carrier-gromov',
    });
    assert.equal(manual.isDemo, false);

    const resetTrip = store.resetDemoTrip();
    assert.equal(resetTrip.versions.length, 1);
    assert.equal(resetTrip.versions[0].loadingTime, '10:00');

    // Проверка сохранения на диск (новый экземпляр FreightStore читает state.json)
    const reloaded = new FreightStore(dataFile);
    const reloadedTrips = reloaded.getStateForRole('logist').trips;
    assert.ok(
      reloadedTrips.some((t) => t.id === manual.id),
      'Ручной рейс должен сохраниться после сброса демо-рейса'
    );
    const demoAfterReload = reloadedTrips.find((t) => t.id === 'trip-demo-7684');
    assert.equal(demoAfterReload.versions.length, 1);
    assert.equal(demoAfterReload.versions[0].loadingTime, '10:00');
  });
});
