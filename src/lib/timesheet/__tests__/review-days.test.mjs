import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDays, confirmedReviewDay, reportedReviewDay } from '../review-days.js';
import { shiftsOf } from '../questions.js';

test('every date appears, including weekends and a missing workday, without changing source records', () => {
  const original = [{ date: '09/03/37', paidHours: 4.5, punches: [{ min: 510 }, { min: 780 }] }];
  const snapshot = structuredClone(original);
  const shown = reviewDays(original, '09/01/37', '09/15/37');
  assert.equal(shown.length, 15);
  assert.equal(shown[0].date, '09/01/37');
  assert.equal(shown.at(-1).date, '09/15/37');
  assert.equal(shown[2], original[0]);
  for (const date of ['09/05/37', '09/06/37', '09/09/37']) {
    const day = shown.find(d => d.date === date);
    assert.equal(day.reviewOnly, true);
    assert.equal(day.paidHours, 0);
    assert.deepEqual(day.punches, []);
    assert.equal(day.restViolation, false);
  }
  assert.deepEqual(original, snapshot);
  assert.equal(shown.reduce((sum, d) => sum + d.paidHours, 0), 4.5);
});

test('review dates cross months and leap day without duplicate or missing dates', () => {
  assert.deepEqual(reviewDays([], '02/28/28', '03/02/28').map(d => d.date), ['02/28/28', '02/29/28', '03/01/28', '03/02/28']);
});

test('an invalid period preserves the available records', () => {
  const days = [{ date: '09/01/37', paidHours: 6.5 }];
  assert.equal(reviewDays(days, '', ''), days);
});

const doubled = () => ({date:'09/11/37',paidHours:13,punches:[510,900,510,900].map(min=>({min})),breaks:[]});
const once = {kind:'duplicateDay',date:'09/11/37',status:'declined',choice:'no'};

test('confirmed once shows one shift and its hours without changing the source', () => {
  const source = doubled();
  const snapshot = structuredClone(source);
  const view = confirmedReviewDay(source, once);
  assert.deepEqual(shiftsOf(view), [{from:510,to:900}]);
  assert.equal(view.paidHours, 6.5);
  assert.equal(view.reviewRecordedHours, 13);
  assert.equal(view.reviewDuplicateOnce, true);
  assert.deepEqual(source, snapshot);
});

test('only a saved once answer changes the display, and changing the answer restores both shifts', () => {
  const day = doubled();
  for (const answer of [null,{...once,status:undefined},{...once,status:'open'},
    {...once,status:'accepted',choice:'yes'},{...once,choice:'yes'},
    {...once,date:'09/10/37'},{...once,kind:'hours'}]) {
    assert.equal(confirmedReviewDay(day,answer),day);
  }
  assert.equal(confirmedReviewDay(day,{...once,choice:null}).paidHours,6.5);
});

test('exact duplicate display keeps distinct shifts and already corrected records', () => {
  const day = {...doubled(),paidHours:14,punches:[510,900,510,900,960,1020].map(min=>({min}))};
  assert.equal(confirmedReviewDay(day,once).paidHours,7.5);
  assert.deepEqual(shiftsOf(confirmedReviewDay(day,once)),[{from:510,to:900},{from:960,to:1020}]);
  const corrected = {...day,paidHours:7.5,punches:[510,900,960,1020].map(min=>({min}))};
  assert.equal(confirmedReviewDay(corrected,once),corrected);
  const legacy = {...doubled(),paidHours:6.5};
  assert.equal(confirmedReviewDay(legacy,once),legacy);
});

test('three copies count once while a different overlapping window stays', () => {
  const day = {...doubled(),paidHours:20.5,punches:[510,900,510,900,510,900,840,900].map(min=>({min}))};
  const view = confirmedReviewDay(day,once);
  assert.equal(view.paidHours,7.5);
  assert.deepEqual(shiftsOf(view),[{from:510,to:900},{from:840,to:900}]);
});

const shortDay = () => ({date:'09/03/37',paidHours:4.5,punches:[510,780].map(min=>({min})),breaks:[{from:600,to:610}],miscBlocks:[]});
const draft = {date:'09/03/37',kind:'hours',claimedHours:6.5,slots:[{from:'830',to:'330'}],note:'Worked until 3:30.'};
test('reported hours replace the review clock and total without changing source pay or breaks', () => {
  const source = shortDay(), snapshot = structuredClone(source);
  const view = reportedReviewDay(source, [{...draft,claimedHours:7}]);
  assert.equal(view.paidHours,7);
  assert.deepEqual(shiftsOf(view),[{from:510,to:930}]);
  assert.equal(view.reviewRecordedHours,4.5);
  assert.equal(view.reviewReported,true);
  assert.deepEqual(view.breaks,[]);
  assert.deepEqual(source,snapshot);
});
test('stored report slots survive reload and match the draft view', () => {
  const source = shortDay();
  const saved = {date:source.date,kind:'hours',claimedHours:7,statedSlots:[{from:510,to:930}]};
  assert.deepEqual(reportedReviewDay(source,[saved]),reportedReviewDay(source,[{...draft,claimedHours:7}]));
});
test('editing and removing a report updates the picture; unrelated or invalid claims keep the source', () => {
  const source = shortDay();
  assert.equal(reportedReviewDay(source,[draft]),source); // mismatch: seven hours of slots, 6.5 claimed
  assert.equal(reportedReviewDay(source,[]),source);
  assert.equal(reportedReviewDay(source,[{...draft,date:'09/04/37'}]),source);
  assert.equal(reportedReviewDay(source,[{...draft,kind:'other'}]),source);
  assert.equal(reportedReviewDay(source,[{...draft,slots:[{from:'830',to:''}]}]),source);
  assert.equal(reportedReviewDay(source,[{...draft,claimedHours:8,slots:[{from:'830',to:'430'}]}]).paidHours,8);
});
test('missing-day and removal reports use the same projection and leave period records intact', () => {
  const blank = reviewDays([],'09/01/37','09/15/37')[2];
  assert.equal(reportedReviewDay(blank,[{...draft,kind:'day_missing',claimedHours:7}]).paidHours,7);
  assert.equal(blank.paidHours,0);
  const removed = reportedReviewDay(shortDay(),[{date:'09/03/37',kind:'day_extra'}]);
  assert.equal(removed.paidHours,0);
  assert.deepEqual(shiftsOf(removed),[]);
});
