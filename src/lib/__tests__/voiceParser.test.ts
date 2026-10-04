import test from 'node:test';
import assert from 'node:assert';
import { parseVoiceTranscript, extractAmount, determineTransactionType, classifyCategory } from '../voiceParser.ts';

test('Voice Parser Unit Tests (20 Comprehensive Test Cases)', async (t) => {
  await t.test('1. "chai 20 rupaye" -> Amount: 20, Type: debit, Category: Food', () => {
    const res = parseVoiceTranscript('chai 20 rupaye');
    assert.strictEqual(res.amount, 20);
    assert.strictEqual(res.type, 'debit');
    assert.strictEqual(res.category, 'Food');
    assert.match(res.note.toLowerCase(), /chai/);
  });

  await t.test('2. "auto ke 50" -> Amount: 50, Type: debit, Category: Travel', () => {
    const res = parseVoiceTranscript('auto ke 50');
    assert.strictEqual(res.amount, 50);
    assert.strictEqual(res.type, 'debit');
    assert.strictEqual(res.category, 'Travel');
    assert.match(res.note.toLowerCase(), /auto/);
  });

  await t.test('3. "salary 25000 aaya" -> Amount: 25000, Type: credit, Category: Salary', () => {
    const res = parseVoiceTranscript('salary 25000 aaya');
    assert.strictEqual(res.amount, 25000);
    assert.strictEqual(res.type, 'credit');
    assert.strictEqual(res.category, 'Salary');
  });

  await t.test('4. "Rahul ko 500 udhar diye" -> Friend: Rahul, Amount: 500, isUdhar: true', () => {
    const res = parseVoiceTranscript('Rahul ko 500 udhar diye');
    assert.strictEqual(res.amount, 500);
    assert.strictEqual(res.isUdhar, true);
    assert.strictEqual(res.friendName, 'Rahul');
  });

  await t.test('5. "fifty rupees for petrol" -> English word amount, Category: Travel', () => {
    const res = parseVoiceTranscript('fifty rupees for petrol');
    assert.strictEqual(res.amount, 50);
    assert.strictEqual(res.type, 'debit');
    assert.strictEqual(res.category, 'Travel');
  });

  await t.test('6. "1500 electricity bill paid" -> Amount: 1500, Category: Bills', () => {
    const res = parseVoiceTranscript('1500 electricity bill paid');
    assert.strictEqual(res.amount, 1500);
    assert.strictEqual(res.type, 'debit');
    assert.strictEqual(res.category, 'Bills');
  });

  await t.test('7. "rent 12000 transferred" -> Amount: 12000, Category: Bills', () => {
    const res = parseVoiceTranscript('rent 12000 transferred');
    assert.strictEqual(res.amount, 12000);
    assert.strictEqual(res.category, 'Bills');
  });

  await t.test('8. "zomato se biryani 350" -> Amount: 350, Category: Food', () => {
    const res = parseVoiceTranscript('zomato se biryani 350');
    assert.strictEqual(res.amount, 350);
    assert.strictEqual(res.category, 'Food');
  });

  await t.test('9. "dawai 450 kharch" -> Amount: 450, Category: Health', () => {
    const res = parseVoiceTranscript('dawai 450 kharch');
    assert.strictEqual(res.amount, 450);
    assert.strictEqual(res.type, 'debit');
    assert.strictEqual(res.category, 'Health');
  });

  await t.test('10. "freelance project ka 15000 mila" -> Amount: 15000, Type: credit', () => {
    const res = parseVoiceTranscript('freelance project ka 15000 mila');
    assert.strictEqual(res.amount, 15000);
    assert.strictEqual(res.type, 'credit');
    assert.strictEqual(res.category, 'Freelance');
  });

  await t.test('11. "movie ticket do sau" -> Compound Hindi words "do sau" = 200, Category: Entertainment', () => {
    const res = parseVoiceTranscript('movie ticket do sau');
    assert.strictEqual(res.amount, 200);
    assert.strictEqual(res.category, 'Entertainment');
  });

  await t.test('12. "Amazon se kapde 2500" -> Amount: 2500, Category: Shopping', () => {
    const res = parseVoiceTranscript('Amazon se kapde 2500');
    assert.strictEqual(res.amount, 2500);
    assert.strictEqual(res.category, 'Shopping');
  });

  await t.test('13. "Amit se 1000 udhar liye" -> Friend: Amit, Amount: 1000, isUdhar: true', () => {
    const res = parseVoiceTranscript('Amit se 1000 udhar liye');
    assert.strictEqual(res.amount, 1000);
    assert.strictEqual(res.isUdhar, true);
    assert.strictEqual(res.friendName, 'Amit');
  });

  await t.test('14. "milk and grocery 120" -> Amount: 120, Category: Food', () => {
    const res = parseVoiceTranscript('milk and grocery 120');
    assert.strictEqual(res.amount, 120);
    assert.strictEqual(res.category, 'Food');
  });

  await t.test('15. "metro recharge 200" -> Amount: 200, Category: Bills or Travel', () => {
    const res = parseVoiceTranscript('metro recharge 200');
    assert.strictEqual(res.amount, 200);
    assert.ok(res.category === 'Bills' || res.category === 'Travel');
  });

  await t.test('16. "5k cashback received" -> Amount: 5000, Type: credit', () => {
    const res = parseVoiceTranscript('5k cashback received');
    assert.strictEqual(res.amount, 5000);
    assert.strictEqual(res.type, 'credit');
  });

  await t.test('17. "dedh sau samosa" -> Special Hindi combination "dedh sau" = 150', () => {
    const res = parseVoiceTranscript('dedh sau samosa');
    assert.strictEqual(res.amount, 150);
    assert.strictEqual(res.category, 'Food');
  });

  await t.test('18. "tuition fees teen hazaar" -> Compound Hindi "teen hazaar" = 3000, Category: Education', () => {
    const res = parseVoiceTranscript('tuition fees teen hazaar');
    assert.strictEqual(res.amount, 3000);
    assert.strictEqual(res.category, 'Education');
  });

  await t.test('19. "dhai hazaar doctor consultation" -> "dhai hazaar" = 2500, Category: Health', () => {
    const res = parseVoiceTranscript('dhai hazaar doctor consultation');
    assert.strictEqual(res.amount, 2500);
    assert.strictEqual(res.category, 'Health');
  });

  await t.test('20. "random talk without amount" -> Amount null, raw transcript in note', () => {
    const res = parseVoiceTranscript('random talk without amount');
    assert.strictEqual(res.amount, null);
    assert.strictEqual(res.rawTranscript, 'random talk without amount');
  });

  await t.test('21. "chai 20 catagrey : office" -> Explicit custom category "Office"', () => {
    const res = parseVoiceTranscript('chai 20 catagrey : office');
    assert.strictEqual(res.amount, 20);
    assert.strictEqual(res.category, 'Office');
    assert.match(res.note.toLowerCase(), /chai/);
    assert.doesNotMatch(res.note.toLowerCase(), /catagrey/);
  });

  await t.test('22. "500 books category: education" -> Explicit category "Education"', () => {
    const res = parseVoiceTranscript('500 books category: education');
    assert.strictEqual(res.amount, 500);
    assert.strictEqual(res.category, 'Education');
    assert.match(res.note.toLowerCase(), /books/);
  });

  await t.test('23. "auto 100 category commute" -> Custom category "Commute"', () => {
    const res = parseVoiceTranscript('auto 100 category commute');
    assert.strictEqual(res.amount, 100);
    assert.strictEqual(res.category, 'Commute');
    assert.match(res.note.toLowerCase(), /auto/);
  });

  await t.test('24. "250 samosa snacks category mein" -> Suffix category "Snacks"', () => {
    const res = parseVoiceTranscript('250 samosa snacks category mein');
    assert.strictEqual(res.amount, 250);
    assert.strictEqual(res.category, 'Snacks');
    assert.match(res.note.toLowerCase(), /samosa/);
  });

  await t.test('25. Default payment mode is UPI', () => {
    const res = parseVoiceTranscript('chai 20 rupaye');
    assert.strictEqual(res.paymentMode, 'UPI');
  });

  await t.test('26. "petrol 500 cash se diya" -> paymentMode: Cash', () => {
    const res = parseVoiceTranscript('petrol 500 cash se diya');
    assert.strictEqual(res.amount, 500);
    assert.strictEqual(res.paymentMode, 'Cash');
    assert.match(res.note.toLowerCase(), /petrol/);
    assert.doesNotMatch(res.note.toLowerCase(), /cash/);
  });

  await t.test('27. "rent 15000 bank transfer" -> paymentMode: Bank', () => {
    const res = parseVoiceTranscript('rent 15000 bank transfer');
    assert.strictEqual(res.amount, 15000);
    assert.strictEqual(res.paymentMode, 'Bank');
    assert.match(res.note.toLowerCase(), /rent/);
    assert.doesNotMatch(res.note.toLowerCase(), /bank/);
  });

  await t.test('28. "shopping 2500 card se" -> paymentMode: Card', () => {
    const res = parseVoiceTranscript('shopping 2500 card se');
    assert.strictEqual(res.amount, 2500);
    assert.strictEqual(res.paymentMode, 'Card');
    assert.doesNotMatch(res.note.toLowerCase(), /card/);
  });

  await t.test('29. "300 gpay se pizza" -> paymentMode: UPI', () => {
    const res = parseVoiceTranscript('300 gpay se pizza');
    assert.strictEqual(res.amount, 300);
    assert.strictEqual(res.paymentMode, 'UPI');
    assert.match(res.note.toLowerCase(), /pizza/);
  });

  await t.test('30. "dawai 400 rokad diya" -> paymentMode: Cash (rokad)', () => {
    const res = parseVoiceTranscript('dawai 400 rokad diya');
    assert.strictEqual(res.amount, 400);
    assert.strictEqual(res.paymentMode, 'Cash');
    assert.match(res.note.toLowerCase(), /dawai/);
  });
});
