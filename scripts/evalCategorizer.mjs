/**
 * Evaluation script for Rupeo's Layered Transaction Categorizer
 * Run with: node scripts/evalCategorizer.mjs
 */

import { classifyTransaction, normalizeMerchant, AUTO_ASSIGN_THRESHOLD, UNCATEGORIZED_LABEL } from '../src/lib/categorizer.ts';

export const EVAL_DATASET = [
  // ── FOOD & DINING (30) ──────────────────────────────────────────────────
  { raw: 'SWIGGY', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Zomato Limited', expected: 'Food', layer: 'brand_dict' },
  { raw: 'UPI-Swiggy-Instamart', expected: 'Food', layer: 'brand_dict' }, // Contains swiggy
  { raw: 'DOMINOS PIZZA', expected: 'Food', layer: 'brand_dict' },
  { raw: 'PIZZA HUT', expected: 'Food', layer: 'brand_dict' },
  { raw: 'McDonalds Family Restaurant', expected: 'Food', layer: 'brand_dict' },
  { raw: 'KFC Restaurant', expected: 'Food', layer: 'brand_dict' },
  { raw: 'BURGER KING INDIA', expected: 'Food', layer: 'brand_dict' },
  { raw: 'SUBWAY FOODS', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Haldirams Sweets and Snacks', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Bikanervala Foods Pvt Ltd', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Chaayos Cafe', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Chai Point', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Starbucks Coffee', expected: 'Coffee', layer: 'brand_dict' },
  { raw: 'Blue Tokai Coffee Roasters', expected: 'Coffee', layer: 'brand_dict' },
  { raw: 'Third Wave Coffee', expected: 'Coffee', layer: 'brand_dict' },
  { raw: 'Behrouz Biryani', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Faasos Kitchen', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Ovenstory Pizza', expected: 'Food', layer: 'brand_dict' },
  { raw: 'Barbeque Nation Hospitality', expected: 'Dining', layer: 'brand_dict' },
  { raw: 'Jabalpur Chat Center', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Gupta Chaat Bhandar', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Sharma Bhojanalaya', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Shree Krishna Dhaba', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Baker Street Bakery', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Annapurna Tiffin Center', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Sagar Ratna Restaurant', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Royal Juice and Shakes', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Bawarchi Biryani House', expected: 'Food', layer: 'keyword_rule' },
  { raw: 'Madras Cafe and Canteen', expected: 'Food', layer: 'keyword_rule' },

  // ── GROCERIES (20) ──────────────────────────────────────────────────────
  { raw: 'Blinkit Commerce', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Zepto Quick Delivery', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'BigBasket Supermarket', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'BB Daily Milk', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'DMart Ready Avenue Supermarts', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Spencers Retail Store', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Natures Basket', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Country Delight Dairy Products', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Mother Dairy Fruit and Veg', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Amul Dairy Outlet', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Reliance Fresh Supermarket', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Reliance Smart Bazaar', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Milkbasket Household', expected: 'Groceries', layer: 'brand_dict' },
  { raw: 'Patel Kirana Store', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'Kisan Sabzi Mandi', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'Lakshmi General Provisions', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'City Hypermarket', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'Apna Bazar Kirana', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'Daily Fresh Vegetables', expected: 'Groceries', layer: 'keyword_rule' },
  { raw: 'Krishna Doodh Dairy', expected: 'Groceries', layer: 'keyword_rule' },

  // ── TRAVEL & COMMUTE (18) ───────────────────────────────────────────────
  { raw: 'Uber India Systems', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Ola Cabs ANI Technologies', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Rapido Bike Taxi', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'IRCTC Train Ticket Booking', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'MakeMyTrip India', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Goibibo Flights and Hotels', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Yatra Online', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'IndiGo Airlines InterGlobe', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Air India Ticket', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Vistara Air Ticket', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'Akasa Air Travel', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'SpiceJet Booking', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'RedBus Bus Ticket', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'AbhiBus Transport', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'DMRC Delhi Metro Card Recharge', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'BMRC Namma Metro Card', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'NETC Fastag Toll Plaza', expected: 'Travel', layer: 'brand_dict' },
  { raw: 'NHAI Tollway Plaza', expected: 'Travel', layer: 'brand_dict' },

  // ── FUEL (12) ───────────────────────────────────────────────────────────
  { raw: 'Indian Oil Petrol Pump', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'IOCL Fuel Station', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'Bharat Petroleum Retail', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'BPCL Auto Fuels', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'Hindustan Petroleum Corporation', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'HPCL Fuel Station', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'Shell Fuel Outlet', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'Nayara Energy Fuel Station', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'Jio-bp Auto Fuel', expected: 'Fuel', layer: 'brand_dict' },
  { raw: 'HP Petrol Pump Highway', expected: 'Fuel', layer: 'keyword_rule' },
  { raw: 'Green CNG Gas Station', expected: 'Fuel', layer: 'keyword_rule' },
  { raw: 'Highway Diesel Service', expected: 'Fuel', layer: 'keyword_rule' },

  // ── SHOPPING & LIFESTYLE (22) ───────────────────────────────────────────
  { raw: 'Sarathe The Hair Studio', expected: 'Shopping', layer: 'keyword_rule' },
  { raw: 'Looks Unisex Salon', expected: 'Shopping', layer: 'keyword_rule' },
  { raw: 'Geetanjali Salon and Spa', expected: 'Shopping', layer: 'keyword_rule' },
  { raw: 'Jawed Habib Hair and Beauty', expected: 'Shopping', layer: 'keyword_rule' },
  { raw: 'Kaya Skin Clinic and Parlour', expected: 'Health', layer: 'keyword_rule' }, // clinic triggers Health
  { raw: 'Golden Scissors Barber Shop', expected: 'Shopping', layer: 'keyword_rule' },
  { raw: 'Amazon India Seller Services', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Flipkart Internet Private Limited', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Myntra Designs Shopping', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Ajio Reliance Retail', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Meesho Online Marketplace', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Nykaa Beauty and Fashion', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Tata CLiQ Luxury Shopping', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Zara Apparel Store', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'H&M Hennes Mauritz', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Decathlon Sports India', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Croma Electronics Megastore', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Reliance Digital Store', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Vijay Sales Electronics', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'IKEA India Retail', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Lenskart Eyewear Solutions', expected: 'Shopping', layer: 'brand_dict' },
  { raw: 'Zudio Apparel Store', expected: 'Shopping', layer: 'brand_dict' },

  // ── HEALTH & PHARMACY (16) ──────────────────────────────────────────────
  { raw: 'Apollo Pharmacy Retail', expected: 'Health', layer: 'brand_dict' },
  { raw: 'PharmEasy Healthcare', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Tata 1mg Healthcare Solutions', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Netmeds Market Place', expected: 'Health', layer: 'brand_dict' },
  { raw: 'MedPlus Chemist and Druggist', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Dr Lal PathLabs Diagnostics', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Metropolis Healthcare Labs', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Max Healthcare Hospital', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Fortis Memorial Hospital', expected: 'Health', layer: 'brand_dict' },
  { raw: 'Manipal Health Enterprises', expected: 'Health', layer: 'brand_dict' },
  { raw: 'City Care Multispeciality Hospital', expected: 'Health', layer: 'keyword_rule' },
  { raw: 'Lifeline Dental Clinic', expected: 'Health', layer: 'keyword_rule' },
  { raw: 'Shree Ram Medical and Chemist', expected: 'Health', layer: 'keyword_rule' },
  { raw: 'Pulse Pathology Diagnostics', expected: 'Health', layer: 'keyword_rule' },
  { raw: 'Vision Care Optical Store', expected: 'Health', layer: 'keyword_rule' },
  { raw: 'Sanjeevani Ayurveda Dispensary', expected: 'Health', layer: 'keyword_rule' },

  // ── BILLS & UTILITIES (15) ──────────────────────────────────────────────
  { raw: 'Airtel Postpaid Bill Payment', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Jio Mobile Recharge Plan', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Vi Vodafone Idea Prepaid Recharge', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'BSNL Landline and Broadband', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Tata Play DTH Service', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Dish TV India Limited', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Sun Direct DTH Recharge', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'ACT Fibernet Broadband', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'Hathway Cable and Datacom', expected: 'Bills', layer: 'brand_dict' },
  { raw: 'BESCOM Electricity Bill', expected: 'Utilities', layer: 'brand_dict' },
  { raw: 'Tata Power Company Limited', expected: 'Utilities', layer: 'brand_dict' },
  { raw: 'Adani Electricity Mumbai', expected: 'Utilities', layer: 'brand_dict' },
  { raw: 'Torrent Power Limited', expected: 'Utilities', layer: 'brand_dict' },
  { raw: 'Indraprastha Gas Limited IGL', expected: 'Utilities', layer: 'brand_dict' },
  { raw: 'Mahanagar Gas Limited MGL', expected: 'Utilities', layer: 'brand_dict' },

  // ── ENTERTAINMENT & SUBSCRIPTIONS (14) ──────────────────────────────────
  { raw: 'Netflix Entertainment Services', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'Disney+ Hotstar Subscription', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'Spotify India Subscription', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'YouTube Premium Membership', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'Amazon Prime Video Subscription', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'Sony LIV Digital Entertainment', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'Zee5 Premium Subscription', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'JioCinema Premium Subscription', expected: 'Subscriptions', layer: 'brand_dict' },
  { raw: 'BookMyShow Bigtree Entertainment', expected: 'Entertainment', layer: 'brand_dict' },
  { raw: 'PVR Cinemas Ticket Booking', expected: 'Entertainment', layer: 'brand_dict' },
  { raw: 'INOX Leisure Multiplex', expected: 'Entertainment', layer: 'brand_dict' },
  { raw: 'Cinepolis India Multiplex', expected: 'Entertainment', layer: 'brand_dict' },
  { raw: 'Regal Cinema Theatre', expected: 'Entertainment', layer: 'keyword_rule' },
  { raw: 'Galaxy Movie Hall', expected: 'Entertainment', layer: 'keyword_rule' },

  // ── EDUCATION & FITNESS (10) ────────────────────────────────────────────
  { raw: 'PhysicsWallah Education', expected: 'Education', layer: 'brand_dict' },
  { raw: 'Udemy Online Learning', expected: 'Education', layer: 'brand_dict' },
  { raw: 'Coursera Inc Course', expected: 'Education', layer: 'brand_dict' },
  { raw: 'Unacademy Online Education', expected: 'Education', layer: 'brand_dict' },
  { raw: 'Cult.fit Healthcare Fitness', expected: 'Fitness', layer: 'brand_dict' },
  { raw: 'Curefit Healthcare Cult Gym', expected: 'Fitness', layer: 'brand_dict' },
  { raw: 'Anytime Fitness Gym Club', expected: 'Fitness', layer: 'brand_dict' },
  { raw: 'Apex Coaching Classes', expected: 'Education', layer: 'keyword_rule' },
  { raw: 'Vidyamandir Classes Academy', expected: 'Education', layer: 'keyword_rule' },
  { raw: 'Powerhouse Gym and Fitness', expected: 'Fitness', layer: 'keyword_rule' },

  // ── UPI MCC CODES (7) ───────────────────────────────────────────────────
  { raw: 'UPI Merchant mc=5812', expected: 'Food', layer: 'upi_mcc', upiUri: 'upi://pay?pa=shop@upi&mc=5812' },
  { raw: 'UPI Merchant mc=5411', expected: 'Groceries', layer: 'upi_mcc', upiUri: 'upi://pay?pa=shop@upi&mc=5411' },
  { raw: 'UPI Merchant mc=5541', expected: 'Fuel', layer: 'upi_mcc', upiUri: 'upi://pay?pa=petrol@upi&mc=5541' },
  { raw: 'UPI Merchant mc=7230', expected: 'Shopping', layer: 'upi_mcc', upiUri: 'upi://pay?pa=salon@upi&mc=7230' },
  { raw: 'UPI Merchant mc=8011', expected: 'Health', layer: 'upi_mcc', upiUri: 'upi://pay?pa=doctor@upi&mc=8011' },
  { raw: 'UPI Merchant mc=4121', expected: 'Travel', layer: 'upi_mcc', upiUri: 'upi://pay?pa=taxi@upi&mc=4121' },
  { raw: 'UPI Merchant mc=4814', expected: 'Bills', layer: 'upi_mcc', upiUri: 'upi://pay?pa=telecom@upi&mc=4814' },

  // ── NEGATIVE CONTROLS / PERSON PAYEES (20) ──────────────────────────────
  // These MUST stay Uncategorized / Review! Never false assign!
  { raw: 'Mrs Gudiya W O Mal', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Rahul Kumar', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Priya Sharma @okaxis', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Sunil Verma @ybl', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Amit Patel @okhdfcbank', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Mr Ramesh Chand S O Mohan Lal', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Deepak Gupta', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Sneha Reddy', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Ananya Rao VPA', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Smt Shanti Devi W O Ram Prasad', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Rohit Deshmukh', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Karan Mehra', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'Vikas Joshi', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'paytmqr2810050501@paytm', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'TO: ANKIT VERMA', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'PAID TO MOHIT GARG', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' },
  { raw: 'tuber trading solutions', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' }, // Negative: not Uber
  { raw: 'nutshell tech creations', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' }, // Negative: not Shell
  { raw: 'freshman orientation desk', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' }, // Negative: not Fresh
  { raw: 'salooncar automotive parts', expected: UNCATEGORIZED_LABEL, layer: 'uncategorized' }, // Negative: not Salon
];

export function runEvaluation() {
  console.log(`\n======================================================`);
  console.log(` RUPEO LAYERED CATEGORIZER ACCURACY BENCHMARK`);
  console.log(` Total Evaluation Test Cases: ${EVAL_DATASET.length}`);
  console.log(`======================================================\n`);

  let totalAssignedExpected = 0;
  let correctAssigned = 0;
  let falseAssigned = 0;

  let totalUncategorizedExpected = 0;
  let correctUncategorized = 0;
  let falselyCategorized = 0;

  const layerStats = {
    user_rule: { total: 0, correct: 0 },
    history: { total: 0, correct: 0 },
    bill_match: { total: 0, correct: 0 },
    brand_dict: { total: 0, correct: 0 },
    keyword_rule: { total: 0, correct: 0 },
    upi_mcc: { total: 0, correct: 0 },
    uncategorized: { total: 0, correct: 0 },
  };

  const confusionList = [];

  for (const item of EVAL_DATASET) {
    const res = classifyTransaction(item.raw, { upiUri: item.upiUri });
    const isExpectedUncat = item.expected === UNCATEGORIZED_LABEL;

    if (isExpectedUncat) {
      totalUncategorizedExpected++;
      if (!res.isAutoAssigned || res.category === UNCATEGORIZED_LABEL) {
        correctUncategorized++;
        layerStats.uncategorized.correct++;
      } else {
        falselyCategorized++;
        confusionList.push({
          raw: item.raw,
          expected: item.expected,
          got: res.category,
          source: res.source,
          confidence: res.confidence,
        });
      }
      layerStats.uncategorized.total++;
    } else {
      totalAssignedExpected++;
      if (layerStats[res.source]) {
        layerStats[res.source].total++;
      }

      if (res.isAutoAssigned && res.category.toLowerCase() === item.expected.toLowerCase()) {
        correctAssigned++;
        if (layerStats[res.source]) {
          layerStats[res.source].correct++;
        }
      } else {
        falseAssigned++;
        confusionList.push({
          raw: item.raw,
          expected: item.expected,
          got: res.category,
          source: res.source,
          confidence: res.confidence,
        });
      }
    }
  }

  const assignedAccuracy = (correctAssigned / totalAssignedExpected) * 100;
  const falseAutoAssignRate = (falselyCategorized / totalUncategorizedExpected) * 100;
  const overallPrecision = (correctAssigned / (correctAssigned + falseAssigned + falselyCategorized)) * 100;

  console.log(`LAYER PERFORMANCE BREAKDOWN:`);
  console.log(`------------------------------------------------------`);
  for (const [layer, stats] of Object.entries(layerStats)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '100.0';
    console.log(`- ${layer.padEnd(16)} : ${stats.correct}/${stats.total} correct (${pct}%)`);
  }

  console.log(`\nACCURACY SUMMARY:`);
  console.log(`------------------------------------------------------`);
  console.log(`Target Category Items Accuracy : ${assignedAccuracy.toFixed(2)}% (Target: >= 90%)`);
  console.log(`Wrong Auto-Assignment Rate     : ${falseAutoAssignRate.toFixed(2)}% (Target: <= 5%)`);
  console.log(`Negative Controls Guarded      : ${correctUncategorized}/${totalUncategorizedExpected} properly flagged for review`);
  console.log(`Overall Precision              : ${overallPrecision.toFixed(2)}%`);

  if (confusionList.length > 0) {
    console.log(`\nCONFUSION LIST (${confusionList.length} items):`);
    console.log(`------------------------------------------------------`);
    for (const c of confusionList) {
      console.log(`[MISMATCH] "${c.raw}" -> Got "${c.got}" via ${c.source} (Conf: ${c.confidence}), Expected "${c.expected}"`);
    }
  } else {
    console.log(`\n🎉 Zero confusion! 100% of cases matched expected classification!`);
  }

  console.log(`======================================================\n`);

  if (assignedAccuracy < 90 || falseAutoAssignRate > 5) {
    process.exitCode = 1;
  }
}

// Run if directly executed
runEvaluation();
