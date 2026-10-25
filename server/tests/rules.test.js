import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGross, computeTax, deductionDays, prorateGross, classifyCheckIn, workedMinutes,
  isHalfDay, attendanceRate,
} from '../src/domain/rules.js';
import { workingDaysInRange, monthRange, fromKey, dateKey, parseTimeToMinutes } from '../src/utils/date.js';
import { haversineMeters, withinRadius } from '../src/utils/geo.js';
import { parseCsv } from '../src/utils/csv.js';

/* --------------------------- attendance rules ---------------------------- */

test('09:15 is on time with a 15 minute grace window, 09:16 is late', () => {
  const at = (h, m) => new Date(Date.UTC(2026, 9, 24, h, m) - 300 * 60000); // Asia/Karachi
  assert.equal(classifyCheckIn(at(9, 0)), 'present');
  assert.equal(classifyCheckIn(at(9, 15)), 'present');
  assert.equal(classifyCheckIn(at(9, 16)), 'late');
  assert.equal(classifyCheckIn(at(8, 30)), 'present');
});

test('worked minutes never go negative and half day is under 5 hours', () => {
  const start = new Date('2026-10-24T04:00:00.000Z');
  const end = new Date('2026-10-24T09:00:00.000Z');
  assert.equal(workedMinutes(start, end), 300);
  assert.equal(workedMinutes(end, start), 0);
  assert.equal(isHalfDay(299), true);
  assert.equal(isHalfDay(300), false);
  assert.equal(isHalfDay(0), false);
});

test('attendance rate follows the brief formula', () => {
  // (present + late + missing + 0.5*half) / (working records - on leave)
  const rate = attendanceRate({ present: 8, late: 1, missingCheckout: 0, halfDay: 2, onLeave: 1, workingRecords: 12 });
  assert.equal(rate, +(((8 + 1 + 1) / 11) * 100).toFixed(2));
  assert.equal(attendanceRate({ workingRecords: 0 }), 0);
});

/* ------------------------------ payroll rules ----------------------------- */

test('gross is 1.5x basic with HRA 40% and medical 10%', () => {
  const g = computeGross({ basic: 120000 });
  assert.equal(g.hra, 48000);
  assert.equal(g.medical, 12000);
  assert.equal(g.gross, 180000);
});

test('tax slabs are illustrative and progressive at the boundary', () => {
  const slabs = [
    { upTo: 600000, base: 0, rate: 0 },
    { upTo: 1200000, base: 0, rate: 0.05 },
    { upTo: 2400000, base: 30000, rate: 0.15 },
    { upTo: 3600000, base: 210000, rate: 0.25 },
    { upTo: null, base: 510000, rate: 0.35 },
  ];
  assert.equal(computeTax(500000, slabs), 0);
  assert.equal(computeTax(600000, slabs), 0);
  assert.equal(computeTax(800000, slabs), 10000); // 200k * 5%
  assert.equal(computeTax(1200000, slabs), 30000); // 600k * 5%
  assert.equal(computeTax(1800000, slabs), 120000); // 30k + 600k*15%
  assert.equal(computeTax(3000000, slabs), 360000); // 210k + 600k*25%
  assert.equal(computeTax(4000000, slabs), 650000); // 510k + 400k*35%
});

test('deduction days add absences, unpaid leave, half days and late penalties', () => {
  const d = deductionDays({ absentDays: 2, unpaidLeaveDays: 1, halfDays: 2, lateDays: 6 });
  assert.equal(d.latePenaltyDays, 1); // 6 lates -> 2 x 0.5
  assert.equal(d.totalDays, 5); // 2 + 1 + 1 (two half days) + 1
  assert.equal(deductionDays({ lateDays: 2 }).latePenaltyDays, 0);
});

test('proration clamps between 0 and the full gross', () => {
  assert.equal(prorateGross(180000, 12, 22), 98181.82);
  assert.equal(prorateGross(180000, 99, 22), 180000);
  assert.equal(prorateGross(180000, 0, 22), 0);
  assert.equal(prorateGross(180000, 5, 0), 0);
});

/* -------------------------------- date utils ------------------------------ */

test('weekends and holidays are skipped when counting working days', () => {
  const { startKey, endKey } = monthRange('2026-10');
  const all = workingDaysInRange(startKey, endKey, [6, 0], []).length;
  const withHoliday = workingDaysInRange(startKey, endKey, [6, 0], ['2026-10-23']).length;
  assert.equal(all - withHoliday, 1);
  assert.equal(workingDaysInRange('2026-10-24', '2026-10-25', [6, 0]).length, 0); // Sat + Sun
  assert.equal(workingDaysInRange('2026-10-26', '2026-10-26', [6, 0]).length, 1);
});

test('date keys round-trip in the company timezone', () => {
  assert.equal(dateKey(fromKey('2026-10-24')), '2026-10-24');
  assert.equal(dateKey(fromKey('2026-01-01')), '2026-01-01');
});

test('parseTimeToMinutes handles HH:MM', () => {
  assert.equal(parseTimeToMinutes('09:00'), 540);
  assert.equal(parseTimeToMinutes('18:30'), 1110);
});

/* ---------------------------------- geo ---------------------------------- */

test('haversine distance is accurate enough for a geofence', () => {
  const office = { lat: 24.8607, lng: 67.0011 }; // Karachi
  const near = { lat: 24.8615, lng: 67.0019 };
  const far = { lat: 24.9, lng: 67.1 };
  assert.ok(haversineMeters(office, office) === 0);
  assert.ok(haversineMeters(office, near) < 200);
  assert.ok(haversineMeters(office, far) > 10000);
  assert.equal(withinRadius(near, office, 150).allowed, true);
  assert.equal(withinRadius(far, office, 150).allowed, false);
  assert.equal(withinRadius(null, office, 150).allowed, false);
});

/* ---------------------------------- csv ---------------------------------- */

test('csv parser handles quotes, commas and CRLF', () => {
  const { headers, records } = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.equal(records.length, 2);
  assert.equal(records[0].a, 'x, y');
  assert.equal(records[0].b, 'he said "hi"');
});
