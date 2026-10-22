import type { NotificationMessageVariant } from '../types.ts';

export const hinglishMessages: Record<string, NotificationMessageVariant[]> = {
  // 1. Morning (9:00 AM) - without budget
  morning: [
    {
      title: 'Rupeo 💛',
      body: 'Good morning {name}! Aaj ka din mast aur productive ho aapke liye ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'Shubh prabhat {name}! ☕ Naya din shuru ho chuka hai, make it awesome 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'Hey {name}! Ready for another great day? Chalo din shuru karte hain ✨',
    },
  ],

  // Morning (9:00 AM) - with budget
  morning_with_budget: [
    {
      title: 'Rupeo 💛',
      body: 'Good morning {name}! Aaj ka budget {budget} hai. Chalo smart kharcha karte hain ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'Shubh prabhat {name}! ☕ Aaj ke liye {budget} target hai. Wallet ko khush rakhein 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'Hey {name}! Naya din, nayi shuruat. Aaj {budget} ke andar rehna hai ✨',
    },
    {
      title: 'Rupeo 💛',
      body: 'Good morning {name}! Aaj {budget} ka budget hai, chalo smart bano 🎯',
    },
  ],

  // Morning without budget
  morning_no_budget: [
    {
      title: 'Rupeo 💛',
      body: 'Good morning {name}! Aaj ka din mast aur productive ho aapke liye ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'Shubh prabhat {name}! ☕ Naya din shuru ho chuka hai, make it awesome 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'Hey {name}! Ready for another great day? Chalo din shuru karte hain ✨',
    },
  ],

  // 2. Lunch (1:00 PM)
  lunch_with_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'Lunch time ho gaya {name}! Aaj ab tak {spent} kharch hua hai. Lunch note karna mat bhoolna 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'Kuch tasty khaya, {name}? Abhi tak {spent} kharch hue hain. 5 second me bill note kar lo ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'Khane ka waqt, {name}! {spent} kharch ho chuka hai aaj. Rupeo me update kar lo 📝',
    },
  ],
  lunch_no_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'Lunch time ho gaya {name}! 🍕 Khana khate hi apna kharcha log karna mat bhoolna 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'Kuch tasty khaya, {name}? 🥗 Bas 5 second nikaal kar apna lunch bill note kar lo ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'Yum! Khana khaa liya, {name}? 🍔 Bhoolne se pehle Rupeo me add kar lo 📝',
    },
  ],

  // 3. Teatime (4:30 PM)
  teatime_with_budget: [
    {
      title: 'Rupeo ☕',
      body: 'Chai time {name}! ☕ Aaj ab tak {spent} kharch hua hai, budget me {left} baki hai 🫖',
    },
    {
      title: 'Rupeo 🍪',
      body: 'Shaam ki chai aur samose, {name}? 🫖 Abhi pocket me {left} baki hain ✨',
    },
    {
      title: 'Rupeo ☕',
      body: 'Chai break check-in {name}! 🍪 {left} baki hai aaj ke budget me. Shaandar ja rahe ho 👏',
    },
  ],
  teatime_no_budget: [
    {
      title: 'Rupeo ☕',
      body: 'Chai ka time ho gaya {name}! ☕ Aaj ab tak {spent} kharch ho chuka hai ✨',
    },
    {
      title: 'Rupeo 🫖',
      body: 'Chai break, {name}! Shaam ki chai aur snacks ka kharcha add kar lo 🍪',
    },
  ],

  // 4. Evening (8:00 PM)
  evening: [
    {
      title: 'Rupeo 🌙',
      body: 'Shaam ho gayi {name}! 🌙 Aaj koi cash chai ya auto ka kharcha log karna baki hai? 📝',
    },
    {
      title: 'Rupeo 🛋️',
      body: 'Din khatam hone ko hai {name}! 🛋️ Chote-mote cash kharche abhi note kar lo ✨',
    },
    {
      title: 'Rupeo 🌙',
      body: 'Hey {name}! Aaj ke chote cash payments note kar liye kya? 📝',
    },
  ],

  // 5. Daily Report (10:00 PM or custom)
  daily_report_under: [
    {
      title: 'Daily Report 📊',
      body: '{name}, aaj aapne {count} payments me {spent} kharch kiye. Top: {top_category} ({top_amount}). Aap budget se {left} bacha gaye 🎉',
    },
    {
      title: 'Daily Report 🌟',
      body: 'Wah {name}! Aaj {spent} kharch hue aur {left} budget se bache rahe. Top kharcha tha {top_category} 👏',
    },
    {
      title: 'Daily Report 🌙',
      body: 'Smart kharche ka din raha 👏 {spent} kharch hue, {left} bacha liya. Shubh ratri {name}! ✨',
    },
  ],
  daily_report_over: [
    {
      title: 'Daily Report 📊',
      body: '{name}, aaj {spent} kharch hue ({over} budget se zyada). Koi baat nahi, kal fresh start karenge 💪',
    },
    {
      title: 'Daily Report 💛',
      body: 'Aaj thoda zyada kharcha ho gaya: {spent} ({over} over budget). Kal ek naya din hai, {name} ✨',
    },
    {
      title: 'Daily Report 🚀',
      body: 'Aaj ka total kharcha {spent} raha. Top kharcha {top_category} ({top_amount}) tha. Kal fir track par aayenge, {name} 💪',
    },
  ],
  daily_report_zero: [
    {
      title: 'Daily Report 🏆',
      body: 'Aaj ₹0 kharcha, {name}! Wallet full safe hai 👏 Mast neend lo aaj.',
    },
    {
      title: 'Daily Report 💛',
      body: 'Wah {name}, aaj ek bhi rupaya kharch nahi hua! 🏆 Gazab ka self control, streak continue rakho ✨',
    },
    {
      title: 'Daily Report 👏',
      body: 'Zero kharcha day, {name}! Paisa safe rakhne ke liye shabash 💛',
    },
  ],
  daily_report_no_budget: [
    {
      title: 'Daily Report 📊',
      body: '{name}, aaj aapne {count} payments me {spent} kharch kiye. Sabse bada kharcha {top_category} ({top_amount}) tha 📝',
    },
    {
      title: 'Daily Report 🌙',
      body: 'Aaj ka hisaab ready hai {name}: kul {spent} kharch hue {count} expenses me. Aaram se so jao 😴',
    },
  ],

  // 6. Budget 80% (Instant)
  budget_80: [
    {
      title: 'Budget Alert ⚠️',
      body: 'Dhyan dein {name}! ⚠️ Aaj ke budget ka 80% use ho chuka hai. Sirf {left} baki hai ⏳',
    },
    {
      title: 'Budget Alert 🟡',
      body: 'Budget alert {name}! 🟡 80% kharcha ho gaya hai. Abhi {left} baki hai, sambhal ke ✨',
    },
    {
      title: 'Budget Alert ⏳',
      body: 'Pocket check {name}! ⏳ Aaj ka 80% budget chala gaya. {left} hi bacha hai 🎯',
    },
  ],

  // 7. Budget Over (Instant, max 1-2 times per day)
  budget_over: [
    {
      title: 'Budget Exceeded 🚨',
      body: 'Oops {name}! 🚨 Aaj ka budget {over} se paar ho gaya. Total kharcha: {spent} of {budget} 🛑',
    },
    {
      title: 'Budget Alert 🛑',
      body: 'Budget alert {name}! 🛑 Aaj ki limit {over} se cross ho gayi hai. Baaki din aaraam se 💛',
    },
    {
      title: 'Budget Alert 💛',
      body: 'Heads up {name}: aaj ka kharcha {spent} ho gaya hai, jo budget se {over} zyada hai 💪',
    },
  ],

  // 8. Weekly Report (Sunday 7 PM)
  weekly_report: [
    {
      title: 'Weekly Report 📈',
      body: 'Hafte ka hisaab taiyaar hai, {name}! 📈 Iss hafte kul {spent} kharch hue. Top tha {top_category} 🗓️',
    },
    {
      title: 'Weekly Report 🗓️',
      body: 'Aapka weekly report aa gaya, {name}! 🗓️ Kul kharcha: {spent}. Dekhein kaisa raha ye hafta ✨',
    },
    {
      title: 'Weekly Report ☕',
      body: 'Sunday wrap-up! ☕ Iss hafte {spent} kharch hue. Agle hafte ke liye ready, {name}? 🚀',
    },
  ],

  // 9. Transaction Added (Auto-add)
  transaction_added: [
    {
      title: 'Transaction Added ⚡',
      body: '{merchant} par {amount} debit hue • Rupeo me add ho gaye ⚡',
    },
    {
      title: 'Expense Logged ✅',
      body: '{amount} ka payment ({merchant}) record ho gaya ✅ • Tap to review',
    },
    {
      title: 'Transaction Added 📝',
      body: '{merchant} par {amount} ka kharcha add kar diya gaya hai 📝',
    },
  ],
};

// Aliases for short keys
hinglishMessages.morning = hinglishMessages.morning_no_budget;
hinglishMessages.lunch = hinglishMessages.lunch_no_spent;
hinglishMessages.lunch_spent = hinglishMessages.lunch_with_spent;
hinglishMessages.teatime = hinglishMessages.teatime_with_budget;
hinglishMessages.report_under = hinglishMessages.daily_report_under;
hinglishMessages.report_over = hinglishMessages.daily_report_over;
hinglishMessages.report_zero = hinglishMessages.daily_report_zero;
