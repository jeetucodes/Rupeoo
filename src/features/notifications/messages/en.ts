import type { NotificationMessageVariant } from '../types.ts';

export const enMessages: Record<string, NotificationMessageVariant[]> = {
  // 1. Morning (9:00 AM) - without budget
  morning: [
    {
      title: 'Rupeo 💛',
      body: 'Good morning, {name}! Have an awesome and productive day ahead ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'Rise and shine, {name}! Hope your day is filled with good vibes and smart moves 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'Hey {name}! Ready for another wonderful day? Let’s make it count ✨',
    },
  ],

  // Morning (9:00 AM) - with budget
  morning_with_budget: [
    {
      title: 'Rupeo 💛',
      body: "Good morning, {name}! Today's budget is {budget}. Let's make it a smart day ☀️",
    },
    {
      title: 'Rupeo ☀️',
      body: 'Rise and shine, {name}! You have {budget} planned for today. You got this 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: "Hey {name}! Fresh day, fresh start. Today's target: stay under {budget} ✨",
    },
    {
      title: 'Rupeo 💛',
      body: "Good morning {name}! Let's keep your wallet happy today with a {budget} budget 🎯",
    },
  ],

  // Morning without budget
  morning_no_budget: [
    {
      title: 'Rupeo 💛',
      body: 'Good morning, {name}! Have an awesome and productive day ahead ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'Rise and shine, {name}! Hope your day is filled with good vibes and smart moves 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'Hey {name}! Ready for another wonderful day? Let’s make it count ✨',
    },
  ],

  // 2. Lunch (1:00 PM)
  lunch_with_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'Lunch time, {name}! Spent {spent} so far today. Remember to log your meal 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'Fueling up, {name}? You are at {spent} today. Take 5 seconds to note lunch ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'Quick lunch check-in, {name}! {spent} spent so far. Enjoy your food!',
    },
  ],
  lunch_no_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'Lunch time, {name}! Don’t forget to log that delicious meal or quick snack 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'Fueling up, {name}? Take 5 seconds to note down your lunch bill ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'Yum! Did you grab food, {name}? Add it to Rupeo before you forget 📝',
    },
  ],

  // 3. Teatime (4:30 PM)
  teatime_with_budget: [
    {
      title: 'Rupeo ☕',
      body: 'Chai break, {name}! You’ve spent {spent} so far with {left} still left today 🫖',
    },
    {
      title: 'Rupeo 🍪',
      body: 'Evening cravings, {name}? You’re at {spent} today — still {left} in your pocket ✨',
    },
    {
      title: 'Rupeo ☕',
      body: 'Midday check-in, {name}! {left} left in today’s budget. Keep going strong 👏',
    },
  ],
  teatime_no_budget: [
    {
      title: 'Rupeo ☕',
      body: 'Time for a quick stretch and tea ☕ You’ve spent {spent} so far today, {name} ✨',
    },
    {
      title: 'Rupeo 🫖',
      body: 'Chai break, {name}! Don’t forget to record any afternoon snacks or chai 🍪',
    },
  ],

  // 4. Evening (8:00 PM)
  evening: [
    {
      title: 'Rupeo 🌙',
      body: 'Evening check-in, {name}! Any cash chai or auto rides to log from today? 📝',
    },
    {
      title: 'Rupeo 🛋️',
      body: 'Wrapping up your day, {name}? Note down any cash spends before you forget ✨',
    },
    {
      title: 'Rupeo 🌙',
      body: 'Hey {name}! Quick reminder to log today’s little cash expenses 📝',
    },
  ],

  // 5. Daily Report (10:00 PM or custom)
  daily_report_under: [
    {
      title: 'Daily Summary 📊',
      body: "{name}, today you spent {spent} across {count} payments. Top: {top_category} ({top_amount}). You're {left} under budget 🎉",
    },
    {
      title: 'Daily Summary 🌟',
      body: 'Great day, {name}! You spent {spent} ({count} payments) and saved {left} under budget. Top: {top_category} 👏',
    },
    {
      title: 'Daily Summary 🌙',
      body: 'Smart spending alert 👏 Spent {spent} on {count} expenses, leaving {left} untouched. Sleep well, {name}! ✨',
    },
  ],
  daily_report_over: [
    {
      title: 'Daily Summary 📊',
      body: '{name}, today you spent {spent} across {count} payments ({over} over budget). No worries, tomorrow is a fresh start 💪',
    },
    {
      title: 'Daily Summary 💛',
      body: 'Today was a bit heavy: {spent} spent ({over} over budget). Tomorrow is a brand new page, {name} ✨',
    },
    {
      title: 'Daily Summary 🚀',
      body: 'Wrapped up today at {spent}. Top spend was {top_category} ({top_amount}). Clean slate waiting tomorrow, {name} 💪',
    },
  ],
  daily_report_zero: [
    {
      title: 'Daily Summary 🏆',
      body: 'Zero spend today, {name}! Your wallet is smiling 👏 Sleep like a champion tonight.',
    },
    {
      title: 'Daily Summary 💛',
      body: 'A pure ₹0 day, {name}! That’s serious discipline. Keep the streak going 🌟',
    },
    {
      title: 'Daily Summary 👏',
      body: 'Nothing spent today, {name}! Proud of you for keeping your money safe ✨',
    },
  ],
  daily_report_no_budget: [
    {
      title: 'Daily Summary 📊',
      body: '{name}, today you spent {spent} across {count} payments. Top: {top_category} ({top_amount}) 📝',
    },
    {
      title: 'Daily Summary 🌙',
      body: 'Here is your daily recap, {name}: {spent} logged across {count} expenses today. Sleep well! 😴',
    },
  ],

  // 6. Budget 80% (Instant)
  budget_80: [
    {
      title: 'Budget Alert ⚠️',
      body: 'Heads up {name}! You’ve used 80% of today’s budget. Only {left} left for the day ⏳',
    },
    {
      title: 'Budget Alert 🟡',
      body: 'Almost at the line, {name}! 80% of today’s budget spent. Tread lightly with {left} left ✨',
    },
    {
      title: 'Budget Alert ⏳',
      body: 'Budget check, {name}! You’ve hit 80% of today’s allowance. {left} remains 🎯',
    },
  ],

  // 7. Budget Over (Instant, max 1-2 times per day)
  budget_over: [
    {
      title: 'Budget Exceeded 🚨',
      body: 'Oops {name}, you crossed today’s budget by {over}. Spent {spent} of {budget} 🛑',
    },
    {
      title: 'Budget Alert 🛑',
      body: 'Budget alert, {name}! You exceeded today’s limit by {over}. Take it easy for the rest of today 💛',
    },
    {
      title: 'Budget Alert 💛',
      body: 'Just a heads up {name}: today’s spending reached {spent}, which is {over} over budget 💪',
    },
  ],

  // 8. Weekly Report (Sunday 7 PM)
  weekly_report: [
    {
      title: 'Weekly Summary 📈',
      body: 'Weekly recap is ready, {name}! You spent {spent} this week. Top category was {top_category} 🗓️',
    },
    {
      title: 'Weekly Summary 🗓️',
      body: 'Your week in Rupeo, {name}! Total expenses: {spent}. Tap to see how you did ✨',
    },
    {
      title: 'Weekly Summary ☕',
      body: 'Sunday wrap-up! {spent} spent this week across your payments. Ready for next week, {name}? 🚀',
    },
  ],

  // 9. Transaction Added (Auto-add)
  transaction_added: [
    {
      title: 'Transaction Added ⚡',
      body: '{amount} debited at {merchant} • Added to Rupeo',
    },
    {
      title: 'Expense Logged ✅',
      body: 'Logged {amount} at {merchant} automatically • Tap to review',
    },
    {
      title: 'Transaction Added 📝',
      body: 'Recorded {amount} for {merchant} in your daily expenses',
    },
  ],
};

// Aliases for short keys
enMessages.morning = enMessages.morning_no_budget;
enMessages.lunch = enMessages.lunch_no_spent;
enMessages.lunch_spent = enMessages.lunch_with_spent;
enMessages.teatime = enMessages.teatime_with_budget;
enMessages.report_under = enMessages.daily_report_under;
enMessages.report_over = enMessages.daily_report_over;
enMessages.report_zero = enMessages.daily_report_zero;
