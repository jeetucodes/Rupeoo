export interface SmsFixture {
  id: string;
  sender: string;
  text: string;
  expected: {
    isFinancial: boolean;
    amount?: number;
    type?: 'expense' | 'income' | 'transfer';
    merchantSubstring?: string;
    accountLast4?: string;
    refNoSubstring?: string;
    isOtpOrPromo?: boolean;
  };
}

export const SMS_FIXTURES: SmsFixture[] = [
  // ---------------------------------------------------------------------------
  // POSITIVE FIXTURES: Top Indian Banks & UPI Apps (120+ Real-format, Anonymized)
  // ---------------------------------------------------------------------------
  // 1-15: HDFC Bank
  {
    id: 'hdfc_1',
    sender: 'AD-HDFCBK-S',
    text: 'Sent Rs. 450.00 from HDFC Bank A/C *1234 to SWIGGY on 21-OCT-26 via UPI/P2M/629584729104. Bal: Rs. 14,350.20.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Swiggy', accountLast4: '1234', refNoSubstring: '629584729104' }
  },
  {
    id: 'hdfc_2',
    sender: 'VM-HDFCBK',
    text: 'Rs 1,500.00 debited from HDFC Bank A/C **5678 on 20-OCT-26 to ZOMATO UPI: zomato@hdfcbank. Ref 629481729384. Avail Bal: INR 12,850.20.',
    expected: { isFinancial: true, amount: 1500, type: 'expense', merchantSubstring: 'Zomato', accountLast4: '5678', refNoSubstring: '629481729384' }
  },
  {
    id: 'hdfc_3',
    sender: 'VK-HDFCBK',
    text: 'Alert: You have spent Rs. 2,499.00 on your HDFC Bank Credit Card ending 9012 at AMAZON INDIA on 19-OCT-26. Avail Limit: Rs. 75,000.',
    expected: { isFinancial: true, amount: 2499, type: 'expense', merchantSubstring: 'Amazon', accountLast4: '9012' }
  },
  {
    id: 'hdfc_4',
    sender: 'AD-HDFCBK',
    text: 'HDFC Bank A/C *1234 credited with INR 35,000.00 on 01-OCT-26 by SALARY/TECHCORP PVT LTD. Avail Bal: Rs. 49,350.20.',
    expected: { isFinancial: true, amount: 35000, type: 'income', merchantSubstring: 'Techcorp', accountLast4: '1234' }
  },
  {
    id: 'hdfc_5',
    sender: 'VK-HDFCBK',
    text: 'Rs. 320.00 paid to UBER via UPI from HDFC Bank A/c xx1234 on 22-Oct-26. RRN: 629618293012. Bal: Rs. 14,030.20.',
    expected: { isFinancial: true, amount: 320, type: 'expense', merchantSubstring: 'Uber', accountLast4: '1234', refNoSubstring: '629618293012' }
  },
  {
    id: 'hdfc_6',
    sender: 'AD-HDFCBK',
    text: 'Withdrawn Rs 2,000.00 at HDFC ATM from A/C *1234 on 18-OCT-26. Avail Bal: Rs. 12,030.20.',
    expected: { isFinancial: true, amount: 2000, type: 'expense', accountLast4: '1234' }
  },
  {
    id: 'hdfc_7',
    sender: 'VK-HDFCBK',
    text: 'Refund of Rs. 450.00 credited to HDFC Bank A/C *1234 from SWIGGY on 21-OCT-26. UPI Ref: 629599201928.',
    expected: { isFinancial: true, amount: 450, type: 'income', merchantSubstring: 'Swiggy', accountLast4: '1234', refNoSubstring: '629599201928' }
  },
  {
    id: 'hdfc_8',
    sender: 'AD-HDFCBK',
    text: 'Debited Rs. 550.00 from HDFC Bank A/C *5678 towards JIO RECHARGE on 15-OCT-26. Ref: 629128491029. Bal: Rs. 11,480.20.',
    expected: { isFinancial: true, amount: 550, type: 'expense', merchantSubstring: 'Jio', accountLast4: '5678', refNoSubstring: '629128491029' }
  },
  {
    id: 'hdfc_9',
    sender: 'VK-HDFCBK',
    text: 'You paid Rs. 1,299.00 to BLINKIT using HDFC Bank Debit Card ending 4321 on 21-OCT-26. Bal: Rs. 10,181.20.',
    expected: { isFinancial: true, amount: 1299, type: 'expense', merchantSubstring: 'Blinkit', accountLast4: '4321' }
  },
  {
    id: 'hdfc_10',
    sender: 'AD-HDFCBK',
    text: 'Rs. 150.00 sent to CHAAYOS via UPI from A/C *1234 on 22-OCT-26. Txn ID: 629618290192.',
    expected: { isFinancial: true, amount: 150, type: 'expense', merchantSubstring: 'Chaayos', accountLast4: '1234', refNoSubstring: '629618290192' }
  },
  {
    id: 'hdfc_11',
    sender: 'VM-HDFCBK',
    text: 'Rs. 4,500.00 debited from A/C *1234 for NEFT to RAJESH KUMAR on 12-OCT-26. UTR: HDFCN26284910294.',
    expected: { isFinancial: true, amount: 4500, type: 'expense', merchantSubstring: 'Rajesh', accountLast4: '1234', refNoSubstring: 'HDFCN26284910294' }
  },
  {
    id: 'hdfc_12',
    sender: 'AD-HDFCBK',
    text: 'Cashback of Rs. 75.00 credited to HDFC Bank A/c ending 1234 on 10-OCT-26. Bal: Rs. 10,256.20.',
    expected: { isFinancial: true, amount: 75, type: 'income', accountLast4: '1234' }
  },
  {
    id: 'hdfc_13',
    sender: 'VK-HDFCBK',
    text: 'Spent Rs. 850.00 at MCDONALDS with HDFC Card ending 9012 on 16-OCT-26.',
    expected: { isFinancial: true, amount: 850, type: 'expense', merchantSubstring: 'Mcdonalds', accountLast4: '9012' }
  },
  {
    id: 'hdfc_14',
    sender: 'AD-HDFCBK',
    text: 'Transferred Rs. 5,000.00 from HDFC Bank A/c *1234 to your own A/c *5678 on 05-OCT-26.',
    expected: { isFinancial: true, amount: 5000, type: 'transfer', accountLast4: '1234' }
  },
  {
    id: 'hdfc_15',
    sender: 'VK-HDFCBK',
    text: 'Rs. 699.00 paid for NETFLIX on HDFC Bank Card 9012 on 03-OCT-26.',
    expected: { isFinancial: true, amount: 699, type: 'expense', merchantSubstring: 'Netflix', accountLast4: '9012' }
  },

  // 16-30: SBI (State Bank of India)
  {
    id: 'sbi_1',
    sender: 'AD-SBIINB',
    text: 'Dear SBI User, your A/C ending with 4321 has been debited by Rs 850.00 on 21Oct26 by transfer to ZEPTO Ref No 629581920194. Bal: Rs 23,400.00.',
    expected: { isFinancial: true, amount: 850, type: 'expense', merchantSubstring: 'Zepto', accountLast4: '4321', refNoSubstring: '629581920194' }
  },
  {
    id: 'sbi_2',
    sender: 'BZ-SBIINB',
    text: 'Your A/C 4321 debited for Rs 120.00 on 22/10/26 through UPI: upi-tea-stall@sbi Ref: 629618291048. SBI.',
    expected: { isFinancial: true, amount: 120, type: 'expense', merchantSubstring: 'Tea', accountLast4: '4321', refNoSubstring: '629618291048' }
  },
  {
    id: 'sbi_3',
    sender: 'AD-SBIINB',
    text: 'Dear Customer, your A/C ending 4321 is credited by Rs 2,500.00 on 14-OCT-26 by UPI/CR/628719284910/PRIYA SHARMA. Bal: Rs 25,900.00.',
    expected: { isFinancial: true, amount: 2500, type: 'income', merchantSubstring: 'Priya', accountLast4: '4321', refNoSubstring: '628719284910' }
  },
  {
    id: 'sbi_4',
    sender: 'BZ-SBIINB',
    text: 'ATM cash withdrawal of Rs. 4,000.00 from A/C *4321 on 10-OCT-26. Clear Bal: Rs 21,900.00.',
    expected: { isFinancial: true, amount: 4000, type: 'expense', accountLast4: '4321' }
  },
  {
    id: 'sbi_5',
    sender: 'AD-SBIINB',
    text: 'Debited Rs 3,450.00 from SBI A/c 4321 for electricity bill at BESCOM on 11-OCT-26. Txn 628491029481.',
    expected: { isFinancial: true, amount: 3450, type: 'expense', merchantSubstring: 'Bescom', accountLast4: '4321', refNoSubstring: '628491029481' }
  },
  {
    id: 'sbi_6',
    sender: 'BZ-SBIINB',
    text: 'Rs. 450.00 paid to DOMINOS PIZZA via UPI from SBI A/c *4321 on 18-OCT-26. UPI Ref 629182940192.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Dominos', accountLast4: '4321', refNoSubstring: '629182940192' }
  },
  {
    id: 'sbi_7',
    sender: 'AD-SBIINB',
    text: 'INR 15,000.00 credited to your A/C 4321 on 01-OCT-26 by NEFT from INFOSYS LTD. Bal: Rs 36,900.00.',
    expected: { isFinancial: true, amount: 15000, type: 'income', merchantSubstring: 'Infosys', accountLast4: '4321' }
  },
  {
    id: 'sbi_8',
    sender: 'BZ-SBIINB',
    text: 'Rs. 2,100.00 spent on your SBI Card ending 6789 at RELIANCE RETAIL on 17-OCT-26.',
    expected: { isFinancial: true, amount: 2100, type: 'expense', merchantSubstring: 'Reliance', accountLast4: '6789' }
  },
  {
    id: 'sbi_9',
    sender: 'AD-SBIINB',
    text: 'Dear Customer, your a/c 4321 debited by Rs. 200.00 on 20-OCT-26 to RAPIDO UPI Ref 629391029481.',
    expected: { isFinancial: true, amount: 200, type: 'expense', merchantSubstring: 'Rapido', accountLast4: '4321', refNoSubstring: '629391029481' }
  },
  {
    id: 'sbi_10',
    sender: 'BZ-SBIINB',
    text: 'Your A/C *4321 debited Rs. 500.00 on 19-OCT-26. Info: PETROL PUMP IOCL. Avail Bal: Rs 19,200.00.',
    expected: { isFinancial: true, amount: 500, type: 'expense', merchantSubstring: 'Petrol', accountLast4: '4321' }
  },
  {
    id: 'sbi_11',
    sender: 'AD-SBIINB',
    text: 'Your SBI A/C 4321 credited with Rs. 1,000.00 on 12-OCT-26 towards REFUND from FLIPKART. Ref 628591029481.',
    expected: { isFinancial: true, amount: 1000, type: 'income', merchantSubstring: 'Flipkart', accountLast4: '4321', refNoSubstring: '628591029481' }
  },
  {
    id: 'sbi_12',
    sender: 'BZ-SBIINB',
    text: 'Paid Rs. 180.00 to METRO TICKETING from SBI a/c 4321 on 21-OCT-26 via UPI 629481920194.',
    expected: { isFinancial: true, amount: 180, type: 'expense', merchantSubstring: 'Metro', accountLast4: '4321', refNoSubstring: '629481920194' }
  },
  {
    id: 'sbi_13',
    sender: 'AD-SBIINB',
    text: 'Rs 12,000.00 debited from A/C *4321 towards RENT TRANSFER on 02-OCT-26. UTR: SBIN26275819201.',
    expected: { isFinancial: true, amount: 12000, type: 'expense', merchantSubstring: 'Rent', accountLast4: '4321', refNoSubstring: 'SBIN26275819201' }
  },
  {
    id: 'sbi_14',
    sender: 'BZ-SBIINB',
    text: 'Rs 350.00 sent to AMIT KUMAR via UPI from A/C 4321 on 16-OCT-26. Txn 628918294019.',
    expected: { isFinancial: true, amount: 350, type: 'expense', merchantSubstring: 'Amit', accountLast4: '4321', refNoSubstring: '628918294019' }
  },
  {
    id: 'sbi_15',
    sender: 'AD-SBIINB',
    text: 'Dear Customer, Rs 99.00 debited from A/c 4321 on 04-OCT-26 for HOTSTAR subscription.',
    expected: { isFinancial: true, amount: 99, type: 'expense', merchantSubstring: 'Hotstar', accountLast4: '4321' }
  },

  // 31-45: ICICI Bank
  {
    id: 'icici_1',
    sender: 'VM-ICICIB',
    text: 'ICICI Bank A/C XX7890 debited for INR 1,840.00 on 21-OCT-26 at BIGBASKET. Avail Bal: INR 31,450.50.',
    expected: { isFinancial: true, amount: 1840, type: 'expense', merchantSubstring: 'Bigbasket', accountLast4: '7890' }
  },
  {
    id: 'icici_2',
    sender: 'VK-ICICIB',
    text: 'Sent Rs. 650.00 from ICICI Bank A/C XX7890 to STARBUCKS via UPI on 22-OCT-26. Ref: 629618294012.',
    expected: { isFinancial: true, amount: 650, type: 'expense', merchantSubstring: 'Starbucks', accountLast4: '7890', refNoSubstring: '629618294012' }
  },
  {
    id: 'icici_3',
    sender: 'VM-ICICIB',
    text: 'ICICI Bank Credit Card XX3456 spent Rs. 4,999.00 at MYNTRA on 18-OCT-26. Avail Limit: INR 1,20,000.',
    expected: { isFinancial: true, amount: 4999, type: 'expense', merchantSubstring: 'Myntra', accountLast4: '3456' }
  },
  {
    id: 'icici_4',
    sender: 'VK-ICICIB',
    text: 'Dear Customer, your A/C XX7890 is credited with INR 8,000.00 on 15-OCT-26 by IMPS from ROHIT VERMA. RRN: 628819201948.',
    expected: { isFinancial: true, amount: 8000, type: 'income', merchantSubstring: 'Rohit', accountLast4: '7890', refNoSubstring: '628819201948' }
  },
  {
    id: 'icici_5',
    sender: 'VM-ICICIB',
    text: 'Rs. 250.00 paid to OLA RIDES from ICICI A/c XX7890 on 20-OCT-26 via UPI 629381920194.',
    expected: { isFinancial: true, amount: 250, type: 'expense', merchantSubstring: 'Ola', accountLast4: '7890', refNoSubstring: '629381920194' }
  },
  {
    id: 'icici_6',
    sender: 'VK-ICICIB',
    text: 'INR 1,200.00 withdrawn from ICICI Bank ATM using card ending 7890 on 19-OCT-26. Bal: INR 30,250.50.',
    expected: { isFinancial: true, amount: 1200, type: 'expense', accountLast4: '7890' }
  },
  {
    id: 'icici_7',
    sender: 'VM-ICICIB',
    text: 'Reversal of Rs. 650.00 done on your ICICI Bank A/C XX7890 on 22-OCT-26 for STARBUCKS. Ref: 629619284910.',
    expected: { isFinancial: true, amount: 650, type: 'income', merchantSubstring: 'Starbucks', accountLast4: '7890', refNoSubstring: '629619284910' }
  },
  {
    id: 'icici_8',
    sender: 'VK-ICICIB',
    text: 'ICICI Bank A/C XX7890 debited: INR 950.00 on 14-OCT-26. Info: PHARMEASY ORDER. Avail Bal: INR 29,300.50.',
    expected: { isFinancial: true, amount: 950, type: 'expense', merchantSubstring: 'Pharmeasy', accountLast4: '7890' }
  },
  {
    id: 'icici_9',
    sender: 'VM-ICICIB',
    text: 'Rs. 399.00 paid for AIRTEL BROADBAND from ICICI Bank A/c XX7890 on 08-OCT-26. Ref: 628192049182.',
    expected: { isFinancial: true, amount: 399, type: 'expense', merchantSubstring: 'Airtel', accountLast4: '7890', refNoSubstring: '628192049182' }
  },
  {
    id: 'icici_10',
    sender: 'VK-ICICIB',
    text: 'Your ICICI Bank Card XX3456 used for INR 850.00 at PVR CINEMAS on 12-OCT-26.',
    expected: { isFinancial: true, amount: 850, type: 'expense', merchantSubstring: 'Pvr', accountLast4: '3456' }
  },
  {
    id: 'icici_11',
    sender: 'VM-ICICIB',
    text: 'INR 1,500.00 spent at SHELL PETROL on ICICI Card XX3456 on 10-OCT-26.',
    expected: { isFinancial: true, amount: 1500, type: 'expense', merchantSubstring: 'Shell', accountLast4: '3456' }
  },
  {
    id: 'icici_12',
    sender: 'VK-ICICIB',
    text: 'ICICI Bank A/c XX7890 credited with Rs. 500.00 on 05-OCT-26 towards CASHBACK from CRED.',
    expected: { isFinancial: true, amount: 500, type: 'income', merchantSubstring: 'Cred', accountLast4: '7890' }
  },
  {
    id: 'icici_13',
    sender: 'VM-ICICIB',
    text: 'Transferred INR 2,000.00 from ICICI A/c XX7890 to self account at SBI on 03-OCT-26.',
    expected: { isFinancial: true, amount: 2000, type: 'transfer', accountLast4: '7890' }
  },
  {
    id: 'icici_14',
    sender: 'VK-ICICIB',
    text: 'Rs. 2,340.00 debited from ICICI A/c XX7890 to APOLLO PHARMACY on 16-OCT-26. UPI: 628918201948.',
    expected: { isFinancial: true, amount: 2340, type: 'expense', merchantSubstring: 'Apollo', accountLast4: '7890', refNoSubstring: '628918201948' }
  },
  {
    id: 'icici_15',
    sender: 'VM-ICICIB',
    text: 'INR 199.00 debited from ICICI A/c XX7890 on 07-OCT-26 for SPOTIFY PREMIUM.',
    expected: { isFinancial: true, amount: 199, type: 'expense', merchantSubstring: 'Spotify', accountLast4: '7890' }
  },

  // 46-60: Axis Bank
  {
    id: 'axis_1',
    sender: 'JD-AXISBK',
    text: 'Axis Bank A/C *5544 debited with INR 720.00 on 21-OCT-26 to KFC INDIA via UPI. Ref No: 629581920491. Bal: INR 18,290.00.',
    expected: { isFinancial: true, amount: 720, type: 'expense', merchantSubstring: 'Kfc', accountLast4: '5544', refNoSubstring: '629581920491' }
  },
  {
    id: 'axis_2',
    sender: 'JD-AXISBK',
    text: 'INR 3,200.00 spent on Axis Bank Credit Card ending 8811 at ZARA on 20-OCT-26. Avail limit: INR 85,000.',
    expected: { isFinancial: true, amount: 3200, type: 'expense', merchantSubstring: 'Zara', accountLast4: '8811' }
  },
  {
    id: 'axis_3',
    sender: 'AD-AXISBK',
    text: 'Your Axis Bank A/C *5544 is credited with INR 4,500.00 on 17-OCT-26 by UPI/CR/629018294019/NEHA SHAH. Bal: INR 19,010.00.',
    expected: { isFinancial: true, amount: 4500, type: 'income', merchantSubstring: 'Neha', accountLast4: '5544', refNoSubstring: '629018294019' }
  },
  {
    id: 'axis_4',
    sender: 'JD-AXISBK',
    text: 'Withdrawn INR 5,000.00 from Axis Bank ATM using A/C *5544 on 15-OCT-26. Bal: INR 14,510.00.',
    expected: { isFinancial: true, amount: 5000, type: 'expense', accountLast4: '5544' }
  },
  {
    id: 'axis_5',
    sender: 'AD-AXISBK',
    text: 'Rs 1,150.00 paid to DMART from Axis A/C *5544 on 18-OCT-26. UPI Ref: 629182940192.',
    expected: { isFinancial: true, amount: 1150, type: 'expense', merchantSubstring: 'Dmart', accountLast4: '5544', refNoSubstring: '629182940192' }
  },
  {
    id: 'axis_6',
    sender: 'JD-AXISBK',
    text: 'INR 550.00 debited from A/C *5544 towards TATA POWER on 13-OCT-26. Ref: 628618294019.',
    expected: { isFinancial: true, amount: 550, type: 'expense', merchantSubstring: 'Tata', accountLast4: '5544', refNoSubstring: '628618294019' }
  },
  {
    id: 'axis_7',
    sender: 'AD-AXISBK',
    text: 'Refund of Rs. 720.00 credited to Axis A/C *5544 on 22-OCT-26 from KFC INDIA. UTR: 629618294019.',
    expected: { isFinancial: true, amount: 720, type: 'income', merchantSubstring: 'Kfc', accountLast4: '5544', refNoSubstring: '629618294019' }
  },
  {
    id: 'axis_8',
    sender: 'JD-AXISBK',
    text: 'Axis Card 8811 used for INR 450.00 at BOOKMYSHOW on 11-OCT-26.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Bookmyshow', accountLast4: '8811' }
  },
  {
    id: 'axis_9',
    sender: 'AD-AXISBK',
    text: 'Rs. 45.00 paid for CHAI at CHAAYOS via UPI from Axis a/c *5544 on 21-OCT-26.',
    expected: { isFinancial: true, amount: 45, type: 'expense', merchantSubstring: 'Chaayos', accountLast4: '5544' }
  },
  {
    id: 'axis_10',
    sender: 'JD-AXISBK',
    text: 'INR 1,299.00 paid to AJIO on Axis Bank Card 8811 on 09-OCT-26.',
    expected: { isFinancial: true, amount: 1299, type: 'expense', merchantSubstring: 'Ajio', accountLast4: '8811' }
  },
  {
    id: 'axis_11',
    sender: 'AD-AXISBK',
    text: 'INR 25,000.00 credited to A/C *5544 on 01-OCT-26 from SALARY. Bal: INR 43,800.00.',
    expected: { isFinancial: true, amount: 25000, type: 'income', merchantSubstring: 'Salary', accountLast4: '5544' }
  },
  {
    id: 'axis_12',
    sender: 'JD-AXISBK',
    text: 'Debited INR 350.00 to FASTAG RECHARGE from Axis A/C *5544 on 16-OCT-26. Ref: 628918294019.',
    expected: { isFinancial: true, amount: 350, type: 'expense', merchantSubstring: 'Fastag', accountLast4: '5544', refNoSubstring: '628918294019' }
  },
  {
    id: 'axis_13',
    sender: 'AD-AXISBK',
    text: 'Paid Rs 1,450.00 to IRCTC via UPI from Axis a/c *5544 on 08-OCT-26. RRN: 628192049182.',
    expected: { isFinancial: true, amount: 1450, type: 'expense', merchantSubstring: 'Irctc', accountLast4: '5544', refNoSubstring: '628192049182' }
  },
  {
    id: 'axis_14',
    sender: 'JD-AXISBK',
    text: 'INR 890.00 debited from A/C *5544 on 06-OCT-26 to 1MG PHARMACY.',
    expected: { isFinancial: true, amount: 890, type: 'expense', merchantSubstring: '1mg', accountLast4: '5544' }
  },
  {
    id: 'axis_15',
    sender: 'AD-AXISBK',
    text: 'Transferred INR 3,000.00 from Axis A/c *5544 to own account on 04-OCT-26.',
    expected: { isFinancial: true, amount: 3000, type: 'transfer', accountLast4: '5544' }
  },

  // 61-75: Kotak Mahindra Bank
  {
    id: 'kotak_1',
    sender: 'BP-KOTAKB',
    text: 'Rs. 580.00 debited from Kotak Bank A/C XX9988 on 21-OCT-26 to SWIGGY. UPI Ref: 629581920194. Bal: Rs. 16,420.00.',
    expected: { isFinancial: true, amount: 580, type: 'expense', merchantSubstring: 'Swiggy', accountLast4: '9988', refNoSubstring: '629581920194' }
  },
  {
    id: 'kotak_2',
    sender: 'BP-KOTAKB',
    text: 'Rs. 2,450.00 spent on Kotak Credit Card ending 2211 at FLIPKART on 20-OCT-26. Limit avail: Rs. 60,000.',
    expected: { isFinancial: true, amount: 2450, type: 'expense', merchantSubstring: 'Flipkart', accountLast4: '2211' }
  },
  {
    id: 'kotak_3',
    sender: 'BP-KOTAKB',
    text: 'Kotak A/C XX9988 credited with Rs. 10,000.00 on 18-OCT-26 by UPI from SUNIL PATEL. Ref 629182940192.',
    expected: { isFinancial: true, amount: 10000, type: 'income', merchantSubstring: 'Sunil', accountLast4: '9988', refNoSubstring: '629182940192' }
  },
  {
    id: 'kotak_4',
    sender: 'BP-KOTAKB',
    text: 'Cash withdrawal of Rs. 3,000.00 from Kotak ATM from A/C XX9988 on 15-OCT-26. Bal: Rs. 13,420.00.',
    expected: { isFinancial: true, amount: 3000, type: 'expense', accountLast4: '9988' }
  },
  {
    id: 'kotak_5',
    sender: 'BP-KOTAKB',
    text: 'Rs. 240.00 paid to UBER INDIA from Kotak A/C XX9988 via UPI on 19-OCT-26. RRN 629281920194.',
    expected: { isFinancial: true, amount: 240, type: 'expense', merchantSubstring: 'Uber', accountLast4: '9988', refNoSubstring: '629281920194' }
  },
  {
    id: 'kotak_6',
    sender: 'BP-KOTAKB',
    text: 'Rs. 1,100.00 paid for MAKEMYTRIP flight booking on Kotak Card 2211 on 14-OCT-26.',
    expected: { isFinancial: true, amount: 1100, type: 'expense', merchantSubstring: 'Makemytrip', accountLast4: '2211' }
  },
  {
    id: 'kotak_7',
    sender: 'BP-KOTAKB',
    text: 'Refund of Rs. 580.00 credited to Kotak Bank A/C XX9988 on 22-OCT-26 from SWIGGY. Ref: 629618294019.',
    expected: { isFinancial: true, amount: 580, type: 'income', merchantSubstring: 'Swiggy', accountLast4: '9988', refNoSubstring: '629618294019' }
  },
  {
    id: 'kotak_8',
    sender: 'BP-KOTAKB',
    text: 'Rs. 450.00 debited from A/C XX9988 towards PIZZA HUT on 12-OCT-26 via UPI. Ref: 628518294019.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Pizza', accountLast4: '9988', refNoSubstring: '628518294019' }
  },
  {
    id: 'kotak_9',
    sender: 'BP-KOTAKB',
    text: 'Spent Rs. 750.00 at BHARAT PETROLEUM with Kotak Card 2211 on 11-OCT-26.',
    expected: { isFinancial: true, amount: 750, type: 'expense', merchantSubstring: 'Bharat', accountLast4: '2211' }
  },
  {
    id: 'kotak_10',
    sender: 'BP-KOTAKB',
    text: 'Rs. 699.00 paid to JIO FIBER from Kotak A/C XX9988 on 09-OCT-26. Ref: 628218294019.',
    expected: { isFinancial: true, amount: 699, type: 'expense', merchantSubstring: 'Jio', accountLast4: '9988', refNoSubstring: '628218294019' }
  },
  {
    id: 'kotak_11',
    sender: 'BP-KOTAKB',
    text: 'Rs. 15,000.00 credited to Kotak A/C XX9988 on 01-OCT-26 towards FREELANCE PROJECT. Bal: Rs. 31,420.00.',
    expected: { isFinancial: true, amount: 15000, type: 'income', merchantSubstring: 'Freelance', accountLast4: '9988' }
  },
  {
    id: 'kotak_12',
    sender: 'BP-KOTAKB',
    text: 'Paid Rs. 120.00 to BURGER KING via UPI from Kotak A/c XX9988 on 17-OCT-26.',
    expected: { isFinancial: true, amount: 120, type: 'expense', merchantSubstring: 'Burger', accountLast4: '9988' }
  },
  {
    id: 'kotak_13',
    sender: 'BP-KOTAKB',
    text: 'Rs. 2,000.00 sent to brother via own account transfer from Kotak A/C XX9988 on 05-OCT-26.',
    expected: { isFinancial: true, amount: 2000, type: 'transfer', accountLast4: '9988' }
  },
  {
    id: 'kotak_14',
    sender: 'BP-KOTAKB',
    text: 'Rs. 1,499.00 debited from Kotak A/C XX9988 for DECATHLON purchase on 07-OCT-26.',
    expected: { isFinancial: true, amount: 1499, type: 'expense', merchantSubstring: 'Decathlon', accountLast4: '9988' }
  },
  {
    id: 'kotak_15',
    sender: 'BP-KOTAKB',
    text: 'Cashback of Rs. 50.00 credited to Kotak A/C XX9988 on 06-OCT-26.',
    expected: { isFinancial: true, amount: 50, type: 'income', accountLast4: '9988' }
  },

  // 76-90: PNB, Canara, Bank of Baroda, IndusInd, IDFC
  {
    id: 'pnb_1',
    sender: 'QP-PNBSMS',
    text: 'A/C 7766 debited with Rs. 1,450.00 on 21-OCT-26 to RELIANCE DIGITAL via UPI. Ref: 629581920491. PNB.',
    expected: { isFinancial: true, amount: 1450, type: 'expense', merchantSubstring: 'Reliance', accountLast4: '7766', refNoSubstring: '629581920491' }
  },
  {
    id: 'pnb_2',
    sender: 'QP-PNBSMS',
    text: 'A/C 7766 credited with Rs. 18,000.00 on 01-OCT-26 by SALARY. Avail Bal: Rs. 24,500.00. PNB.',
    expected: { isFinancial: true, amount: 18000, type: 'income', merchantSubstring: 'Salary', accountLast4: '7766' }
  },
  {
    id: 'pnb_3',
    sender: 'QP-PNBSMS',
    text: 'Withdrawn Rs. 2,500.00 from ATM using PNB A/C 7766 on 14-OCT-26. Clear Bal: Rs 6,500.00.',
    expected: { isFinancial: true, amount: 2500, type: 'expense', accountLast4: '7766' }
  },
  {
    id: 'canara_1',
    sender: 'CP-CANBNK',
    text: 'Canara Bank A/c ...3322 debited for Rs 890.00 on 20-OCT-26 towards NYKAA. Ref: 629481920194.',
    expected: { isFinancial: true, amount: 890, type: 'expense', merchantSubstring: 'Nykaa', accountLast4: '3322', refNoSubstring: '629481920194' }
  },
  {
    id: 'canara_2',
    sender: 'CP-CANBNK',
    text: 'Canara Bank A/C ...3322 credited by Rs 3,000.00 on 17-OCT-26 from ANIL SHARMA. Bal: Rs 15,200.00.',
    expected: { isFinancial: true, amount: 3000, type: 'income', merchantSubstring: 'Anil', accountLast4: '3322' }
  },
  {
    id: 'canara_3',
    sender: 'CP-CANBNK',
    text: 'Cash withdrawal Rs 1,000.00 from ATM on Canara A/c 3322 on 12-OCT-26.',
    expected: { isFinancial: true, amount: 1000, type: 'expense', accountLast4: '3322' }
  },
  {
    id: 'bob_1',
    sender: 'AX-BOIIND',
    text: 'Your Bank of India A/C *8877 debited by Rs. 350.00 on 21-OCT-26 at SUBWAY via UPI. Ref: 629581920194.',
    expected: { isFinancial: true, amount: 350, type: 'expense', merchantSubstring: 'Subway', accountLast4: '8877', refNoSubstring: '629581920194' }
  },
  {
    id: 'bob_2',
    sender: 'AX-BOIIND',
    text: 'A/c *8877 credited with Rs. 5,000.00 on 10-OCT-26 by IMPS from VIKRAM. RRN: 628318294019.',
    expected: { isFinancial: true, amount: 5000, type: 'income', merchantSubstring: 'Vikram', accountLast4: '8877', refNoSubstring: '628318294019' }
  },
  {
    id: 'indus_1',
    sender: 'QP-INDUSB',
    text: 'Rs. 1,650.00 spent on IndusInd Credit Card ending 4455 at MEESHO on 19-OCT-26.',
    expected: { isFinancial: true, amount: 1650, type: 'expense', merchantSubstring: 'Meesho', accountLast4: '4455' }
  },
  {
    id: 'indus_2',
    sender: 'QP-INDUSB',
    text: 'IndusInd A/C *6622 debited with Rs. 420.00 on 22-OCT-26 for INOX CINEMAS via UPI 629618294019.',
    expected: { isFinancial: true, amount: 420, type: 'expense', merchantSubstring: 'Inox', accountLast4: '6622', refNoSubstring: '629618294019' }
  },
  {
    id: 'idfc_1',
    sender: 'CP-IDFCSM',
    text: 'IDFC FIRST Bank A/c ending 1199 debited by INR 990.00 on 21-OCT-26 to INSTAMART. Ref: 629581920194. Bal: INR 28,450.00.',
    expected: { isFinancial: true, amount: 990, type: 'expense', merchantSubstring: 'Instamart', accountLast4: '1199', refNoSubstring: '629581920194' }
  },
  {
    id: 'idfc_2',
    sender: 'CP-IDFCSM',
    text: 'INR 2,500.00 spent on IDFC FIRST Credit Card ending 7733 at TATA CLIQ on 18-OCT-26.',
    expected: { isFinancial: true, amount: 2500, type: 'expense', merchantSubstring: 'Tata', accountLast4: '7733' }
  },
  {
    id: 'idfc_3',
    sender: 'CP-IDFCSM',
    text: 'IDFC FIRST Bank A/C ending 1199 credited with INR 6,500.00 on 16-OCT-26 from DIVIDEND. Bal: INR 29,440.00.',
    expected: { isFinancial: true, amount: 6500, type: 'income', merchantSubstring: 'Dividend', accountLast4: '1199' }
  },
  {
    id: 'yes_1',
    sender: 'IM-YESBNK',
    text: 'YES Bank A/C *4433 debited for Rs. 380.00 on 21-OCT-26 at HALDIRAMS via UPI. RRN: 629581920194.',
    expected: { isFinancial: true, amount: 380, type: 'expense', merchantSubstring: 'Haldirams', accountLast4: '4433', refNoSubstring: '629581920194' }
  },
  {
    id: 'rbl_1',
    sender: 'CP-RBLBNK',
    text: 'Rs. 2,150.00 spent on RBL Card ending 9944 at CROMA on 17-OCT-26.',
    expected: { isFinancial: true, amount: 2150, type: 'expense', merchantSubstring: 'Croma', accountLast4: '9944' }
  },

  // 91-105: Wallets & UPI Apps (Paytm, PhonePe, GPay, CRED, Amex)
  {
    id: 'paytm_1',
    sender: 'VK-PAYTM',
    text: 'Paid Rs. 140.00 to AUTO COMMUTE from Paytm Wallet on 22-OCT-26. Txn ID: 629618294019. Bal: Rs. 450.00.',
    expected: { isFinancial: true, amount: 140, type: 'expense', merchantSubstring: 'Auto', refNoSubstring: '629618294019' }
  },
  {
    id: 'paytm_2',
    sender: 'VK-PAYTM',
    text: 'Received Rs. 500.00 in Paytm Payments Bank A/C *8822 from DEEPAK on 21-OCT-26 via UPI. Ref 629581920194.',
    expected: { isFinancial: true, amount: 500, type: 'income', merchantSubstring: 'Deepak', accountLast4: '8822', refNoSubstring: '629581920194' }
  },
  {
    id: 'phonepe_1',
    sender: 'BW-PHNP',
    text: 'Rs. 250.00 paid to GROFERS from Bank A/C *1234 using PhonePe on 21-OCT-26. UTR: 629581920194.',
    expected: { isFinancial: true, amount: 250, type: 'expense', merchantSubstring: 'Grofers', accountLast4: '1234', refNoSubstring: '629581920194' }
  },
  {
    id: 'phonepe_2',
    sender: 'BW-PHNP',
    text: 'Payment of Rs. 450.00 to ELECTRICITY BILL successful via PhonePe on 18-OCT-26. Ref: 629182940192.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Electricity', refNoSubstring: '629182940192' }
  },
  {
    id: 'gpay_1',
    sender: 'VK-GPAY',
    text: 'You sent Rs. 350.00 to MOHIT SHARMA using Google Pay from A/C ending 5678 on 20-OCT-26. UPI Ref: 629481920194.',
    expected: { isFinancial: true, amount: 350, type: 'expense', merchantSubstring: 'Mohit', accountLast4: '5678', refNoSubstring: '629481920194' }
  },
  {
    id: 'gpay_2',
    sender: 'VK-GPAY',
    text: 'You received Rs. 1,200.00 from KAVITA on Google Pay on 19-OCT-26. Ref: 629381920194.',
    expected: { isFinancial: true, amount: 1200, type: 'income', merchantSubstring: 'Kavita', refNoSubstring: '629381920194' }
  },
  {
    id: 'cred_1',
    sender: 'VK-CRED',
    text: 'Paid Rs. 5,000.00 towards your HDFC Credit Card bill via CRED on 15-OCT-26. Ref: CRED62881920194.',
    expected: { isFinancial: true, amount: 5000, type: 'expense', merchantSubstring: 'Hdfc', refNoSubstring: 'CRED62881920194' }
  },
  {
    id: 'cred_2',
    sender: 'VK-CRED',
    text: 'Cashback of Rs. 120.00 credited to CRED Cash wallet on 16-OCT-26.',
    expected: { isFinancial: true, amount: 120, type: 'income' }
  },
  {
    id: 'amex_1',
    sender: 'AD-AMEX',
    text: 'You spent INR 8,450.00 on your American Express Card ending 1005 at IKEA INDIA on 19-OCT-26.',
    expected: { isFinancial: true, amount: 8450, type: 'expense', merchantSubstring: 'Ikea', accountLast4: '1005' }
  },
  {
    id: 'amex_2',
    sender: 'AD-AMEX',
    text: 'INR 1,200.00 spent at SHELL PETROL on Amex Card ending 1005 on 14-OCT-26.',
    expected: { isFinancial: true, amount: 1200, type: 'expense', merchantSubstring: 'Shell', accountLast4: '1005' }
  },
  {
    id: 'airtel_1',
    sender: 'VK-AIRTEL',
    text: 'Rs. 299.00 debited from Airtel Payments Bank A/C *7711 on 21-OCT-26 to RECHARGE. Bal: Rs. 1,240.00.',
    expected: { isFinancial: true, amount: 299, type: 'expense', merchantSubstring: 'Recharge', accountLast4: '7711' }
  },
  {
    id: 'fed_1',
    sender: 'AD-FEDBNK',
    text: 'Federal Bank A/c ending 8833 debited with Rs. 920.00 on 20-OCT-26 to LENSKART. UTR: 629481920194.',
    expected: { isFinancial: true, amount: 920, type: 'expense', merchantSubstring: 'Lenskart', accountLast4: '8833', refNoSubstring: '629481920194' }
  },
  {
    id: 'au_1',
    sender: 'JD-AUBANK',
    text: 'Rs 1,750.00 spent on AU Bank Debit Card ending 5511 at WESTSIDE on 18-OCT-26.',
    expected: { isFinancial: true, amount: 1750, type: 'expense', merchantSubstring: 'Westside', accountLast4: '5511' }
  },
  {
    id: 'sc_1',
    sender: 'CP-SCBANK',
    text: 'Standard Chartered Card ending 3311 used for INR 3,890.00 at H&M on 17-OCT-26.',
    expected: { isFinancial: true, amount: 3890, type: 'expense', merchantSubstring: 'H&m', accountLast4: '3311' }
  },
  {
    id: 'hsbc_1',
    sender: 'VM-HSBCBK',
    text: 'HSBC A/C ending 9922 debited by INR 1,400.00 on 16-OCT-26 to COUNTRY DELIGHT via UPI.',
    expected: { isFinancial: true, amount: 1400, type: 'expense', merchantSubstring: 'Country', accountLast4: '9922' }
  },

  // 106-125: Formatting Variations (Indian Digits, Dr/Cr, Multiline, Mixed Hindi/English)
  {
    id: 'var_1',
    sender: 'AD-HDFCBK',
    text: 'A/c 1234 Dr. by Rs. 1,23,456.78 on 20-OCT-26 to TATA MOTORS. Bal: Rs. 4,50,000.00.',
    expected: { isFinancial: true, amount: 123456.78, type: 'expense', merchantSubstring: 'Tata', accountLast4: '1234' }
  },
  {
    id: 'var_2',
    sender: 'AD-SBIINB',
    text: 'A/c *4321 Cr. for INR 75,000.00 on 01-OCT-26 towards CONSULTING FEES. Bal: INR 1,12,000.00.',
    expected: { isFinancial: true, amount: 75000, type: 'income', merchantSubstring: 'Consulting', accountLast4: '4321' }
  },
  {
    id: 'var_3',
    sender: 'VM-ICICIB',
    text: 'Your ICICI Bank A/C XX7890\nwas debited for Rs 850.00\non 21-OCT-26\npaid to BLINKIT\nRef: 629581920194.',
    expected: { isFinancial: true, amount: 850, type: 'expense', merchantSubstring: 'Blinkit', accountLast4: '7890', refNoSubstring: '629581920194' }
  },
  {
    id: 'var_4',
    sender: 'AD-HDFCBK',
    text: 'A/c se debit hua Rs. 500.00 on 21-OCT-26 to CHAI POINT via UPI 629581920194. Bal: Rs. 12,300.',
    expected: { isFinancial: true, amount: 500, type: 'expense', merchantSubstring: 'Chai', refNoSubstring: '629581920194' }
  },
  {
    id: 'var_5',
    sender: 'BZ-SBIINB',
    text: 'Rs 1500 bhej diye to VIJAY via UPI from SBI a/c *4321 on 22-OCT-26. Ref 629618294019.',
    expected: { isFinancial: true, amount: 1500, type: 'expense', merchantSubstring: 'Vijay', accountLast4: '4321', refNoSubstring: '629618294019' }
  },
  {
    id: 'var_6',
    sender: 'JD-AXISBK',
    text: 'Rs. 450.00 paid to ZEETO VPA zeeto@okaxis from A/c 5544 on 21-OCT-26.',
    expected: { isFinancial: true, amount: 450, type: 'expense', merchantSubstring: 'Zeeto', accountLast4: '5544' }
  },
  {
    id: 'var_7',
    sender: 'BP-KOTAKB',
    text: 'Debited Rs 2,300.00 from Kotak A/C XX9988 at APOLLO CLINIC on 18-OCT-26. Bal Rs 14,000.',
    expected: { isFinancial: true, amount: 2300, type: 'expense', merchantSubstring: 'Apollo', accountLast4: '9988' }
  },
  {
    id: 'var_8',
    sender: 'AD-HDFCBK',
    text: 'Rs. 60.00 debited from A/C *1234 on 22-OCT-26. Paid to MOTHER DAIRY. UPI/P2M/629618294019.',
    expected: { isFinancial: true, amount: 60, type: 'expense', merchantSubstring: 'Mother', accountLast4: '1234', refNoSubstring: '629618294019' }
  },
  {
    id: 'var_9',
    sender: 'AD-SBIINB',
    text: 'Rs 10,500.00 credited to SBI A/c 4321 on 15-OCT-26 by RENT from TENANT SURESH.',
    expected: { isFinancial: true, amount: 10500, type: 'income', merchantSubstring: 'Suresh', accountLast4: '4321' }
  },
  {
    id: 'var_10',
    sender: 'VM-ICICIB',
    text: 'Spent Rs. 3,450.00 on card XX3456 at FASTRACK on 19-OCT-26.',
    expected: { isFinancial: true, amount: 3450, type: 'expense', merchantSubstring: 'Fastrack', accountLast4: '3456' }
  },
  {
    id: 'var_11',
    sender: 'JD-AXISBK',
    text: 'Rs 180.00 sent to AUTO DRIVER via UPI from Axis a/c 5544 on 21-OCT-26. Ref 629581920194.',
    expected: { isFinancial: true, amount: 180, type: 'expense', merchantSubstring: 'Auto', accountLast4: '5544', refNoSubstring: '629581920194' }
  },
  {
    id: 'var_12',
    sender: 'BP-KOTAKB',
    text: 'Kotak A/C XX9988 debited with INR 85.00 on 22-OCT-26 at CHAI THELA via UPI.',
    expected: { isFinancial: true, amount: 85, type: 'expense', merchantSubstring: 'Chai', accountLast4: '9988' }
  },
  {
    id: 'var_13',
    sender: 'AD-HDFCBK',
    text: 'INR 1,120.00 paid to DOMINOS on HDFC Card 9012 on 20-OCT-26.',
    expected: { isFinancial: true, amount: 1120, type: 'expense', merchantSubstring: 'Dominos', accountLast4: '9012' }
  },
  {
    id: 'var_14',
    sender: 'AD-SBIINB',
    text: 'Rs. 450.00 credited to A/C *4321 on 18-OCT-26. CASHBACK RECEIVED.',
    expected: { isFinancial: true, amount: 450, type: 'income', accountLast4: '4321' }
  },
  {
    id: 'var_15',
    sender: 'VM-ICICIB',
    text: 'ICICI A/C XX7890 debited for Rs 12,500.00 on 05-OCT-26 towards HOME LOAN EMI. Ref 627819201948.',
    expected: { isFinancial: true, amount: 12500, type: 'expense', merchantSubstring: 'Home', accountLast4: '7890', refNoSubstring: '627819201948' }
  },
  {
    id: 'var_16',
    sender: 'JD-AXISBK',
    text: 'Rs. 500.00 paid for PETROL at BHARAT PETROLEUM from Axis A/C 5544 on 17-OCT-26.',
    expected: { isFinancial: true, amount: 500, type: 'expense', merchantSubstring: 'Petrol', accountLast4: '5544' }
  },
  {
    id: 'var_17',
    sender: 'AD-HDFCBK',
    text: 'Rs. 950.00 debited from A/C *1234 to MEDPLUS PHARMACY on 16-OCT-26. UPI: 628918294019.',
    expected: { isFinancial: true, amount: 950, type: 'expense', merchantSubstring: 'Medplus', accountLast4: '1234', refNoSubstring: '628918294019' }
  },
  {
    id: 'var_18',
    sender: 'BZ-SBIINB',
    text: 'Rs 1,299.00 paid to ZARA on SBI Card 6789 on 15-OCT-26.',
    expected: { isFinancial: true, amount: 1299, type: 'expense', merchantSubstring: 'Zara', accountLast4: '6789' }
  },
  {
    id: 'var_19',
    sender: 'BP-KOTAKB',
    text: 'Transferred Rs 8,000.00 from Kotak A/C XX9988 to own account at HDFC on 10-OCT-26.',
    expected: { isFinancial: true, amount: 8000, type: 'transfer', accountLast4: '9988' }
  },
  {
    id: 'var_20',
    sender: 'AD-HDFCBK',
    text: 'Refund of INR 1,200.00 credited to HDFC Card 9012 on 14-OCT-26 from AMAZON.',
    expected: { isFinancial: true, amount: 1200, type: 'income', merchantSubstring: 'Amazon', accountLast4: '9012' }
  },

  // ---------------------------------------------------------------------------
  // NEGATIVE FIXTURES: Must be ignored (40 Negative Cases: OTPs, Promos, Loans, Mandates, Bills, Balances)
  // ---------------------------------------------------------------------------
  // OTPs (1-10)
  {
    id: 'neg_otp_1',
    sender: 'AD-HDFCBK',
    text: '482910 is your OTP for HDFC Bank NetBanking login. Valid for 10 minutes. Do not share with anyone.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_2',
    sender: 'AD-SBIINB',
    text: 'Your One Time Password (OTP) for SBI UPI transaction of Rs. 500 is 918241. Never share your OTP with anyone.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_3',
    sender: 'VM-ICICIB',
    text: 'OTP 829401 for your transaction of INR 1,200.00 on ICICI Bank Card ending 3456. Do not share code with anyone.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_4',
    sender: 'JD-AXISBK',
    text: 'Your secret verification code is 192841 for Axis Bank mobile app. Valid for 5 mins. Axis Bank never asks for OTP.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_5',
    sender: 'BP-KOTAKB',
    text: '554192 is your security OTP for adding beneficiary on Kotak NetBanking. Do not share.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_6',
    sender: 'VK-PAYTM',
    text: '192038 is your Paytm login OTP. Do not share your OTP with anyone including Paytm employees.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_7',
    sender: 'BW-PHNP',
    text: 'Your PhonePe login code is 881920. Do not share this secret code with anyone.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_8',
    sender: 'AD-HDFCBK',
    text: 'Use code 661928 to authenticate payment of Rs. 2,499.00 at Swiggy. Never share your OTP.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_9',
    sender: 'AD-SBIINB',
    text: '729104 is your login OTP for YONO SBI. Valid for 3 mins. Do not share.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_otp_10',
    sender: 'VM-ICICIB',
    text: 'Do not share this OTP: 551928 for login to iMobile app.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },

  // Promotional Offers & Loans (11-20)
  {
    id: 'neg_promo_1',
    sender: 'AD-HDFCBK',
    text: 'Congratulations! You are pre-approved for an Instant Personal Loan of Rs. 5,00,000 at special interest rates. Apply now: hdfcbk.io/loan',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_2',
    sender: 'AD-SBIINB',
    text: 'Special offer! Get flat 50% off on your next purchase using SBI Credit Card. Click here: sbi.co.in/deal',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_3',
    sender: 'VM-ICICIB',
    text: 'Avail pre-approved credit card limit upgrade to Rs. 2,50,000 today. Click here to claim your exclusive offer.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_4',
    sender: 'JD-AXISBK',
    text: 'Win up to Rs. 1,000 cashback! Pay your utility bills using Axis Bank mobile app today. Hurry, limited period offer.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_5',
    sender: 'BP-KOTAKB',
    text: 'Need funds? Avail loan of up to Rs. 10 Lakhs in 10 seconds with zero paperwork. Apply now: kotak.com/loan',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_6',
    sender: 'VK-PAYTM',
    text: 'Flat Rs. 100 cashback on your next movie ticket booking on Paytm. Use promo code MOVIE100. Call now or tap app.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_7',
    sender: 'AD-HDFCBK',
    text: 'Upgrade your card to HDFC Regalia Gold and get complimentary airport lounge access. Apply now: hdfc.com/card',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_8',
    sender: 'AD-SBIINB',
    text: 'Instant personal loan of Rs. 2,00,000 waiting for you. Zero processing fee for next 24 hours. Avail loan now.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_9',
    sender: 'VM-ICICIB',
    text: 'Chance to win iPhone 16! Spend Rs. 10,000 on ICICI Credit Card this festive season. Exclusive offer for you.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_promo_10',
    sender: 'JD-AXISBK',
    text: 'Discounts up to 30% on top dining restaurants with your Axis Bank cards. Check details here.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },

  // Mandates & Scheduled Reminders (21-26)
  {
    id: 'neg_mandate_1',
    sender: 'AD-HDFCBK',
    text: 'Reminder: Rs. 1,500.00 will be debited from your HDFC Bank A/c *1234 towards SIP on 25-OCT-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_mandate_2',
    sender: 'AD-SBIINB',
    text: 'Your standing instruction reminder: Rs. 4,200.00 is scheduled to be debited from A/C *4321 on 24-OCT-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_mandate_3',
    sender: 'VM-ICICIB',
    text: 'Auto-debit due reminder: Rs. 699.00 will be deducted for NETFLIX on 28-OCT-26 from ICICI A/C XX7890.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_mandate_4',
    sender: 'JD-AXISBK',
    text: 'Mandate created successfully. An upcoming debit of Rs. 2,000.00 is scheduled for 26-OCT-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_mandate_5',
    sender: 'BP-KOTAKB',
    text: 'Reminder: your emi will be debited on 27-OCT-26 for Rs. 8,500.00 from Kotak A/C XX9988.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_mandate_6',
    sender: 'AD-HDFCBK',
    text: 'UPI auto-debit of Rs. 199.00 is scheduled for tomorrow from A/c 1234.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },

  // Balance & Mini-Statement Alerts (27-32)
  {
    id: 'neg_bal_1',
    sender: 'AD-HDFCBK',
    text: 'Dear Customer, available balance in your HDFC Bank A/C *1234 is Rs. 14,350.20 as on 22-OCT-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bal_2',
    sender: 'AD-SBIINB',
    text: 'Dear Customer, your balance enquiry successful. A/c *4321 bal is INR 23,400.00 on 22-OCT-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bal_3',
    sender: 'VM-ICICIB',
    text: 'Clear balance for A/C XX7890 is Rs. 31,450.50 as on 21-OCT-26. ICICI Bank.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bal_4',
    sender: 'JD-AXISBK',
    text: 'Mini-statement: Your last 3 transactions on A/C 5544. Avail balance: Rs. 18,290.00.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bal_5',
    sender: 'BP-KOTAKB',
    text: 'Your A/c balance for XX9988 is Rs. 16,420.00. Kotak Bank.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bal_6',
    sender: 'QP-PNBSMS',
    text: 'Dear customer, available balance for a/c 7766 is Rs 24,500.00 as on 22-Oct-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },

  // Failed / Declined Transactions (33-36)
  {
    id: 'neg_fail_1',
    sender: 'AD-HDFCBK',
    text: 'Your transaction of Rs. 1,500.00 at SWIGGY was declined due to insufficient funds in A/c 1234.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_fail_2',
    sender: 'AD-SBIINB',
    text: 'Transaction failed: payment of Rs 850.00 to ZOMATO could not be processed due to bank server timeout.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_fail_3',
    sender: 'VM-ICICIB',
    text: 'Payment declined: Rs. 2,400.00 on Card XX3456 at AMAZON was unsuccessful.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_fail_4',
    sender: 'JD-AXISBK',
    text: 'UPI transaction of Rs. 350.00 failed due to technical error at beneficiary bank.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },

  // Credit Card Bill / Statement Dues (37-40)
  {
    id: 'neg_bill_1',
    sender: 'AD-HDFCBK',
    text: 'Statement for your HDFC Bank Credit Card ending 9012 is generated. Total amount due is Rs. 14,850.00. Due date is 05-NOV-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bill_2',
    sender: 'AD-SBIINB',
    text: 'Your SBI Card minimum amount due is Rs. 750.00, total amount due is Rs. 8,450.00. Payment due date is 03-NOV-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bill_3',
    sender: 'VM-ICICIB',
    text: 'Bill generated for ICICI Credit Card XX3456: Total due INR 22,400.00. Pay before 04-11-26 to avoid late fee.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
  {
    id: 'neg_bill_4',
    sender: 'JD-AXISBK',
    text: 'Axis Bank Card statement: Total amount due Rs. 6,890.00. Due date is 07-NOV-26.',
    expected: { isFinancial: false, isOtpOrPromo: true }
  },
];
