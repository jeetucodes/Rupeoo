import { parseAlert } from '../src/lib/alertParser.ts';
import { SMS_FIXTURES } from '../src/lib/__tests__/fixtures/smsFixtures.ts';

function runEvaluation() {
  console.log('='.repeat(70));
  console.log('   RUPEO BANK & UPI ALERT PARSER EVALUATION');
  console.log('='.repeat(70));

  let totalPositive = 0;
  let correctAmount = 0;
  let correctType = 0;
  let correctMerchant = 0;
  let totalWithExpectedMerchant = 0;
  let correctAccount = 0;
  let totalWithExpectedAccount = 0;
  let correctRefNo = 0;
  let totalWithExpectedRefNo = 0;

  let totalNegative = 0;
  let correctlyRejectedNegative = 0;
  let falsePositiveNegatives = 0;

  const failures = [];

  for (const fixture of SMS_FIXTURES) {
    const parsed = parseAlert(fixture.text, { sender: fixture.sender });

    if (fixture.expected.isFinancial) {
      totalPositive++;
      let hasError = false;
      const fixtureErrors = [];

      // Check False Positive rejection on positive item
      if (parsed.isOtpOrPromo) {
        hasError = true;
        fixtureErrors.push(`Marked as OTP/Promo false positive`);
      }

      // Check Amount
      if (fixture.expected.amount !== undefined) {
        if (parsed.amount === fixture.expected.amount) {
          correctAmount++;
        } else {
          hasError = true;
          fixtureErrors.push(`Amount mismatch: expected ${fixture.expected.amount}, got ${parsed.amount}`);
        }
      }

      // Check Direction
      if (fixture.expected.type !== undefined) {
        if (parsed.type === fixture.expected.type) {
          correctType++;
        } else {
          hasError = true;
          fixtureErrors.push(`Direction mismatch: expected ${fixture.expected.type}, got ${parsed.type}`);
        }
      }

      // Check Merchant
      if (fixture.expected.merchantSubstring) {
        totalWithExpectedMerchant++;
        const target = fixture.expected.merchantSubstring.toLowerCase();
        const norm = (parsed.merchantNormalized || '').toLowerCase();
        const raw = (parsed.merchant || '').toLowerCase();
        if (norm.includes(target) || raw.includes(target)) {
          correctMerchant++;
        } else {
          hasError = true;
          fixtureErrors.push(`Merchant mismatch: expected '${fixture.expected.merchantSubstring}', got norm='${parsed.merchantNormalized}' raw='${parsed.merchant}'`);
        }
      }

      // Check Account Last 4
      if (fixture.expected.accountLast4) {
        totalWithExpectedAccount++;
        if (parsed.accountLast4 === fixture.expected.accountLast4) {
          correctAccount++;
        } else {
          hasError = true;
          fixtureErrors.push(`Account mismatch: expected ${fixture.expected.accountLast4}, got ${parsed.accountLast4}`);
        }
      }

      // Check Ref No
      if (fixture.expected.refNoSubstring) {
        totalWithExpectedRefNo++;
        if (parsed.refNo && parsed.refNo.includes(fixture.expected.refNoSubstring)) {
          correctRefNo++;
        } else {
          hasError = true;
          fixtureErrors.push(`RefNo mismatch: expected ${fixture.expected.refNoSubstring}, got ${parsed.refNo}`);
        }
      }

      if (hasError) {
        failures.push({
          id: fixture.id,
          text: fixture.text,
          errors: fixtureErrors,
        });
      }
    } else {
      // Negative test case (OTP, promo, mandate, balance, failed)
      totalNegative++;
      if (parsed.isOtpOrPromo) {
        correctlyRejectedNegative++;
      } else {
        falsePositiveNegatives++;
        failures.push({
          id: fixture.id,
          text: fixture.text,
          errors: [`Negative case NOT rejected! Parsed: amount=${parsed.amount}, conf=${parsed.confidence}`],
        });
      }
    }
  }

  const amountAcc = (correctAmount / totalPositive) * 100;
  const typeAcc = (correctType / totalPositive) * 100;
  const merchantAcc = (correctMerchant / totalWithExpectedMerchant) * 100;
  const accountAcc = totalWithExpectedAccount > 0 ? (correctAccount / totalWithExpectedAccount) * 100 : 100;
  const refNoAcc = totalWithExpectedRefNo > 0 ? (correctRefNo / totalWithExpectedRefNo) * 100 : 100;
  const negativeRejectionRate = (correctlyRejectedNegative / totalNegative) * 100;

  console.log(`\nEvaluated ${SMS_FIXTURES.length} total fixtures (${totalPositive} positive, ${totalNegative} negative):`);
  console.log(`- Amount Accuracy:          ${amountAcc.toFixed(2)}% (${correctAmount}/${totalPositive}) [Target: >= 98%]`);
  console.log(`- Direction/Type Accuracy:  ${typeAcc.toFixed(2)}% (${correctType}/${totalPositive}) [Target: >= 98%]`);
  console.log(`- Merchant Accuracy:        ${merchantAcc.toFixed(2)}% (${correctMerchant}/${totalWithExpectedMerchant}) [Target: >= 95%]`);
  console.log(`- Account Last 4 Accuracy:  ${accountAcc.toFixed(2)}% (${correctAccount}/${totalWithExpectedAccount})`);
  console.log(`- RefNo/UTR Accuracy:       ${refNoAcc.toFixed(2)}% (${correctRefNo}/${totalWithExpectedRefNo})`);
  console.log(`- Negative Cases Rejected:  ${negativeRejectionRate.toFixed(2)}% (${correctlyRejectedNegative}/${totalNegative})`);
  console.log(`- OTP/Promo False Positives: ${falsePositiveNegatives} [Target: 0]`);

  if (failures.length > 0) {
    console.log(`\n❌ ${failures.length} Failures Detected:`);
    for (const f of failures) {
      console.log(`\n[${f.id}] "${f.text.substring(0, 80)}..."`);
      for (const err of f.errors) {
        console.log(`  -> ${err}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\n✨ ALL FIXTURES PASSED TARGET THRESHOLDS PERFECTLY!');
    process.exit(0);
  }
}

runEvaluation();
