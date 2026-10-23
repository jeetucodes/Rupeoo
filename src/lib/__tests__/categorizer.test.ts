import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  classifyTransaction,
  normalizeMerchant,
  getMerchantTokens,
  extractUpiMcc,
  setInMemoryUserRules,
  clearInMemoryUserRules,
  AUTO_ASSIGN_THRESHOLD,
  UNCATEGORIZED_LABEL,
} from '../categorizer.ts';

describe('Layered Explainable Categorizer Suite', () => {
  beforeEach(() => {
    clearInMemoryUserRules();
  });

  // 1. Merchant Normalization
  describe('Merchant Normalization', () => {
    it('strips prefixes like UPI-, VPA, TO, PAID TO, SENT TO', () => {
      assert.strictEqual(normalizeMerchant('UPI-Swiggy'), 'swiggy');
      assert.strictEqual(normalizeMerchant('VPA: uber@okaxis'), 'uber');
      assert.strictEqual(normalizeMerchant('PAID TO ZOMATO ONLINE'), 'zomato online');
      assert.strictEqual(normalizeMerchant('TO: AMIT SHARMA'), 'amit sharma');
    });

    it('strips UPI VPA handles (@okaxis, @ybl, @oksbi, @paytm, @okhdfcbank)', () => {
      assert.strictEqual(normalizeMerchant('swiggy@okaxis'), 'swiggy');
      assert.strictEqual(normalizeMerchant('rahul.kumar@ybl'), 'rahul kumar');
      assert.strictEqual(normalizeMerchant('shopkeeper@paytm'), 'shopkeeper');
      assert.strictEqual(normalizeMerchant('store@okhdfcbank'), 'store');
    });

    it('strips Paytm QR codes and long numeric strings', () => {
      assert.strictEqual(normalizeMerchant('paytmqr2810050501@paytm'), '');
      assert.strictEqual(normalizeMerchant('paytm-qr9876543210'), '');
      assert.strictEqual(normalizeMerchant('Chai Stall 9876543210'), 'chai stall');
    });

    it('removes honorifics and relations', () => {
      // Mrs Gudiya W O Mal -> gudiya mal
      assert.strictEqual(normalizeMerchant('Mrs Gudiya W O Mal'), 'gudiya mal');
      assert.strictEqual(normalizeMerchant('Mr Ramesh Chand S/O Mohan Lal'), 'ramesh chand mohan lal');
      assert.strictEqual(normalizeMerchant('Dr Smt Priya Sharma D/O Verma'), 'priya sharma verma');
    });

    it('preserves clean tokens and strips corporate suffixes except Air India', () => {
      assert.strictEqual(normalizeMerchant('Swiggy Private Limited India'), 'swiggy');
      assert.strictEqual(normalizeMerchant('Air India Ticket'), 'air india ticket');
      assert.strictEqual(normalizeMerchant('Zomato Pvt Ltd'), 'zomato');
    });
  });

  // 2. Priority Order Tests
  describe('Priority Order Resolution (First Confident Match Wins)', () => {
    it('Priority 1: User rule overrides History, Bill match, Brand dictionary, and Keyword rules', () => {
      // Swiggy is normally 'Food' via brand dictionary.
      // But if user sets Swiggy -> 'Shopping', user rule MUST win!
      setInMemoryUserRules({ swiggy: 'Shopping' });

      const res = classifyTransaction('Swiggy', {
        historyTransactions: [
          { merchant_name: 'Swiggy', category: 'Food' },
          { merchant_name: 'Swiggy', category: 'Food' },
        ],
        candidateBills: [
          { title: 'Swiggy One Membership', amount: 500, category: 'Subscriptions' },
        ],
        amount: 500,
      });

      assert.strictEqual(res.category, 'Shopping');
      assert.strictEqual(res.source, 'user_rule');
      assert.strictEqual(res.confidence, 1.0);
      assert.strictEqual(res.isAutoAssigned, true);
    });

    it('Priority 2: History overrides Bill match and Brand dictionary', () => {
      // Merchant 'Metro Cafe' has both brand/keyword signals, but user previously classified it as 'Entertainment' twice
      const res = classifyTransaction('Metro Cafe', {
        historyTransactions: [
          { merchant_name: 'Metro Cafe', category: 'Entertainment' },
          { merchant_name: 'Metro Cafe', category: 'Entertainment' },
        ],
      });

      assert.strictEqual(res.category, 'Entertainment');
      assert.strictEqual(res.source, 'history');
      assert.strictEqual(res.confidence, 0.92);
      assert.strictEqual(res.isAutoAssigned, true);
    });

    it('Priority 3: Bill match overrides Brand dictionary and Keyword rules when amount and provider match', () => {
      // 'Airtel' is normally 'Bills'. If candidate bill is 'Airtel Broadband' with amount 999 and category 'Utilities'
      const res = classifyTransaction('Airtel Payments', {
        amount: 999,
        candidateBills: [
          { title: 'Airtel Broadband', amount: 999, category: 'Utilities' },
        ],
      });

      assert.strictEqual(res.category, 'Utilities');
      assert.strictEqual(res.source, 'bill_match');
      assert.strictEqual(res.confidence, 0.95);
      assert.strictEqual(res.isAutoAssigned, true);
    });

    it('Priority 4: Brand dictionary overrides Keyword rules', () => {
      // 'Starbucks Coffee' has brand 'starbucks' (Coffee) and keyword 'coffee'. Brand dict matches first!
      const res = classifyTransaction('Starbucks Coffee');
      assert.strictEqual(res.category, 'Coffee');
      assert.strictEqual(res.source, 'brand_dict');
      assert.strictEqual(res.confidence, 0.94);
    });

    it('Priority 5: Keyword rules override UPI MCC when MCC is absent or low', () => {
      const res = classifyTransaction('Jabalpur Chat Center');
      assert.strictEqual(res.category, 'Food');
      assert.strictEqual(res.source, 'keyword_rule');
      assert.strictEqual(res.confidence, 0.88);
      assert.strictEqual(res.isAutoAssigned, true);
    });

    it('Priority 6: UPI MCC assigns category when merchant name has no signals', () => {
      const res = classifyTransaction('Random Vendor Name', {
        upiUri: 'upi://pay?pa=vendor@upi&pn=Vendor&mc=5411',
      });
      assert.strictEqual(res.category, 'Groceries');
      assert.strictEqual(res.source, 'upi_mcc');
      assert.strictEqual(res.confidence, 0.90);
      assert.strictEqual(res.isAutoAssigned, true);
    });
  });

  // 3. History Voting Thresholds
  describe('History Voting Logic', () => {
    it('requires >= 2 consistent entries to classify via history', () => {
      // Only 1 entry -> should NOT use history
      const resSingle = classifyTransaction('Gupta General Trading', {
        historyTransactions: [
          { merchant_name: 'Gupta General Trading', category: 'Shopping' },
        ],
      });
      assert.notStrictEqual(resSingle.source, 'history');

      // 2 consistent entries -> qualifies as history!
      const resTwo = classifyTransaction('Gupta General Trading', {
        historyTransactions: [
          { merchant_name: 'Gupta General Trading', category: 'Shopping' },
          { merchant_name: 'Gupta General Trading', category: 'Shopping' },
        ],
      });
      assert.strictEqual(resTwo.category, 'Shopping');
      assert.strictEqual(resTwo.source, 'history');
    });

    it('does not match history if categories are split (1 vs 1 tie)', () => {
      const res = classifyTransaction('Gupta General Trading', {
        historyTransactions: [
          { merchant_name: 'Gupta General Trading', category: 'Shopping' },
          { merchant_name: 'Gupta General Trading', category: 'Food' },
        ],
      });
      assert.notStrictEqual(res.source, 'history');
    });

    it('ignores Uncategorized / Others entries in history voting', () => {
      const res = classifyTransaction('Gupta General Trading', {
        historyTransactions: [
          { merchant_name: 'Gupta General Trading', category: 'Uncategorized' },
          { merchant_name: 'Gupta General Trading', category: 'Others' },
          { merchant_name: 'Gupta General Trading', category: 'Shopping' },
        ],
      });
      assert.notStrictEqual(res.source, 'history');
    });
  });

  // 4. Token Matching & Substring Negatives
  describe('Token Matching and Substring Safety', () => {
    it('does not falsely trigger Uber on "tuber"', () => {
      const res = classifyTransaction('tuber trading solutions');
      assert.strictEqual(res.isAutoAssigned, false);
      assert.strictEqual(res.category, UNCATEGORIZED_LABEL);
    });

    it('does not falsely trigger Shell on "nutshell"', () => {
      const res = classifyTransaction('nutshell tech creations');
      assert.strictEqual(res.isAutoAssigned, false);
      assert.strictEqual(res.category, UNCATEGORIZED_LABEL);
    });

    it('does not falsely trigger Fresh on "freshman"', () => {
      const res = classifyTransaction('freshman orientation desk');
      assert.strictEqual(res.isAutoAssigned, false);
      assert.strictEqual(res.category, UNCATEGORIZED_LABEL);
    });

    it('matches multi-token brands in any order of surrounding words', () => {
      const res1 = classifyTransaction('Dr Lal PathLabs Diagnostics');
      assert.strictEqual(res1.category, 'Health');
      assert.strictEqual(res1.source, 'brand_dict');

      const res2 = classifyTransaction('The Barbeque Nation Express');
      assert.strictEqual(res2.category, 'Dining');
    });
  });

  // 5. Person-Style Payees and Threshold Behavior
  describe('Person-Style Payees & Threshold Behavior', () => {
    it('marks personal payee "Mrs Gudiya W O Mal" as Uncategorized below threshold', () => {
      const res = classifyTransaction('Mrs Gudiya W O Mal');
      assert.strictEqual(res.category, UNCATEGORIZED_LABEL);
      assert.strictEqual(res.isAutoAssigned, false);
      assert.ok(res.confidence < AUTO_ASSIGN_THRESHOLD);
      assert.strictEqual(res.source, 'uncategorized');
    });

    it('marks "Rahul Kumar" as Uncategorized for one-tap review', () => {
      const res = classifyTransaction('Rahul Kumar');
      assert.strictEqual(res.category, UNCATEGORIZED_LABEL);
      assert.strictEqual(res.isAutoAssigned, false);
      assert.ok(res.confidence < AUTO_ASSIGN_THRESHOLD);
    });

    it('correctly categorizes shop names with shop signals like "Sarathe The Hair Studio"', () => {
      const res = classifyTransaction('Sarathe The Hair Studio');
      assert.strictEqual(res.category, 'Shopping');
      assert.strictEqual(res.isAutoAssigned, true);
      assert.ok(res.confidence >= AUTO_ASSIGN_THRESHOLD);
    });

    it('handles income directions with high confidence', () => {
      const resIncome = classifyTransaction('Client Payment', { type: 'income' });
      assert.strictEqual(resIncome.category, 'Income');
      assert.strictEqual(resIncome.isAutoAssigned, true);

      const resSalary = classifyTransaction('TechCorp Salary Transfer', { type: 'income' });
      assert.strictEqual(resSalary.category, 'Salary');
      assert.strictEqual(resSalary.isAutoAssigned, true);
    });

    it('handles transfer direction with high confidence', () => {
      const resTransfer = classifyTransaction('Self Account Transfer', { type: 'transfer' });
      assert.strictEqual(resTransfer.category, 'Others');
      assert.strictEqual(resTransfer.isAutoAssigned, true);
    });
  });
});
