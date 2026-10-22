import type { NotificationMessageVariant } from '../types.ts';

export const hiMessages: Record<string, NotificationMessageVariant[]> = {
  // 1. Morning (9:00 AM) - without budget
  morning: [
    {
      title: 'Rupeo 💛',
      body: 'सुप्रभात {name}! आपका आज का दिन सुखद और सफल रहे ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'शुभ प्रभात {name}! ☕ सकारात्मक ऊर्जा के साथ नए दिन की शुरुआत करें 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'नमस्ते {name}! एक और सुंदर दिन आपके सामने है, इसे खास बनाएं ✨',
    },
  ],

  // Morning (9:00 AM) - with budget
  morning_with_budget: [
    {
      title: 'Rupeo 💛',
      body: 'सुप्रभात {name}! आज का बजट {budget} है। चलो समझदारी से खर्च करें ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'शुभ प्रभात {name}! ☕ आज का लक्ष्य {budget} के अंदर रहना है। आपका दिन शुभ हो 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'नमस्ते {name}! नया दिन, नई शुरुआत। आज {budget} का लक्ष्य पूरा करना है ✨',
    },
    {
      title: 'Rupeo 💛',
      body: 'सुप्रभात {name}! आज अपने बटुए को खुश रखें, लक्ष्य है {budget} 🎯',
    },
  ],

  // Morning without budget
  morning_no_budget: [
    {
      title: 'Rupeo 💛',
      body: 'सुप्रभात {name}! आपका आज का दिन सुखद और सफल रहे ☀️',
    },
    {
      title: 'Rupeo ☀️',
      body: 'शुभ प्रभात {name}! ☕ सकारात्मक ऊर्जा के साथ नए दिन की शुरुआत करें 🚀',
    },
    {
      title: 'Rupeo ☕',
      body: 'नमस्ते {name}! एक और सुंदर दिन आपके सामने है, इसे खास बनाएं ✨',
    },
  ],

  // 2. Lunch (1:00 PM)
  lunch_with_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'दोपहर का भोजन समय {name}! आज अब तक {spent} खर्च हुए हैं। लंच का खर्च जोड़ना न भूलें 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'भोजन का समय, {name}! आज {spent} खर्च हो चुके हैं। 5 सेकंड में बिल दर्ज करें ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'स्वादिष्ट खाना खाया, {name}? आज का खर्च {spent} है, लंच तुरंत दर्ज करें 📝',
    },
  ],
  lunch_no_spent: [
    {
      title: 'Rupeo 🍕',
      body: 'दोपहर का खाना हो गया, {name}? 🍕 अपना लंच या स्नैक्स का खर्च तुरंत दर्ज करें 🥪',
    },
    {
      title: 'Rupeo 🥗',
      body: 'भोजन का समय, {name}! 🥗 सिर्फ 5 सेकंड निकालें और लंच का बिल Rupeo में जोड़ें ✨',
    },
    {
      title: 'Rupeo 🍔',
      body: 'स्वादिष्ट खाना खाया, {name}? 🍔 भूलने से पहले खर्च नोट कर लें 📝',
    },
  ],

  // 3. Teatime (4:30 PM)
  teatime_with_budget: [
    {
      title: 'Rupeo ☕',
      body: 'शाम की चाय का समय, {name}! ☕ अब तक {spent} खर्च हुए हैं, {left} बजट शेष है 🫖',
    },
    {
      title: 'Rupeo 🍪',
      body: 'चाय ब्रेक, {name}! 🫖 आज की जेब में अभी {left} बचे हैं। शानदार! ✨',
    },
    {
      title: 'Rupeo ☕',
      body: 'शाम का हालचाल, {name}! 🍪 आज {left} बजट अभी बाकी है। समझदारी जारी रखें 👏',
    },
  ],
  teatime_no_budget: [
    {
      title: 'Rupeo ☕',
      body: 'शाम की चाय का समय हो गया, {name}! ☕ आज अब तक {spent} खर्च हुए हैं ✨',
    },
    {
      title: 'Rupeo 🫖',
      body: 'चाय ब्रेक, {name}! शाम की चाय और स्नैक्स का खर्च Rupeo में जोड़ लें 🍪',
    },
  ],

  // 4. Evening (8:00 PM)
  evening: [
    {
      title: 'Rupeo 🌙',
      body: 'शाम की याददिहानी, {name}! 🌙 आज का कोई नकद खर्च या ऑटो का किराया लिखना बाकी है? 📝',
    },
    {
      title: 'Rupeo 🛋️',
      body: 'दिन समाप्त होने को है, {name}! 🛋️ छोटे-मोटे नकद खर्च अभी दर्ज कर लें ✨',
    },
    {
      title: 'Rupeo 🌙',
      body: 'नमस्ते {name}! दिनभर के नकद भुगतान Rupeo में नोट कर लिए क्या? 📝',
    },
  ],

  // 5. Daily Report (10:00 PM or custom)
  daily_report_under: [
    {
      title: 'दैनिक विवरण 📊',
      body: '{name}, आज आपने {count} भुगतानों में {spent} खर्च किए। मुख्य: {top_category} ({top_amount})। आप बजट से {left} बचा गए 🎉',
    },
    {
      title: 'दैनिक विवरण 🌟',
      body: 'बहुत खूब {name}! आज {spent} खर्च हुए और {left} की बचत हुई। मुख्य खर्च {top_category} रहा 👏',
    },
    {
      title: 'दैनिक विवरण 🌙',
      body: 'समझदारी भरा दिन 👏 {spent} खर्च हुए, {left} सुरक्षित रहा। शुभ रात्रि, {name}! ✨',
    },
  ],
  daily_report_over: [
    {
      title: 'दैनिक विवरण 📊',
      body: '{name}, आज {spent} खर्च हुए ({over} बजट से अधिक)। कोई बात नहीं, कल नई शुरुआत होगी 💪',
    },
    {
      title: 'दैनिक विवरण 💛',
      body: 'आज खर्च थोड़ा अधिक रहा: {spent} ({over} बजट से ऊपर)। कल एक नया अवसर है, {name} ✨',
    },
    {
      title: 'दैनिक विवरण 🚀',
      body: 'आज का कुल खर्च {spent} रहा। मुख्य खर्च {top_category} ({top_amount}) था। कल फिर संतुलन बनाएंगे, {name} 💪',
    },
  ],
  daily_report_zero: [
    {
      title: 'दैनिक विवरण 🏆',
      body: 'आज शून्य खर्च, {name}! बटुआ पूरी तरह सुरक्षित रहा 👏 सुकून भरी नींद लें।',
    },
    {
      title: 'दैनिक विवरण 💛',
      body: 'वाह {name}, आज एक भी रुपया खर्च नहीं हुआ! 🏆 शानदार अनुशासन, सिलसिला बनाए रखें ✨',
    },
    {
      title: 'दैनिक विवरण 👏',
      body: 'शून्य खर्च दिवस, {name}! बचत के प्रति आपकी निष्ठा सराहनीय है 💛',
    },
  ],
  daily_report_no_budget: [
    {
      title: 'दैनिक विवरण 📊',
      body: '{name}, आज आपने {count} भुगतानों में कुल {spent} खर्च किए। मुख्य खर्च {top_category} ({top_amount}) रहा 📊',
    },
    {
      title: 'दैनिक विवरण 🌙',
      body: 'आज का दैनिक विवरण तैयार है {name}: {count} भुगतानों में कुल {spent} खर्च। आराम से सोएं 😴',
    },
  ],

  // 6. Budget 80% (Instant)
  budget_80: [
    {
      title: 'बजट चेतावनी ⚠️',
      body: 'सावधान {name}! ⚠️ आज के बजट का 80% उपयोग हो चुका है। केवल {left} शेष है ⏳',
    },
    {
      title: 'बजट चेतावनी 🟡',
      body: 'बजट अलर्ट, {name}! 🟡 80% बजट खर्च हो चुका है। अब {left} ही बचा है, ध्यान से खर्चें ✨',
    },
    {
      title: 'बजट चेतावनी ⏳',
      body: 'बजट सूचना {name}! ⏳ आज के बजट का 80% पूरा हो गया है। {left} शेष है 🎯',
    },
  ],

  // 7. Budget Over (Instant, max 1-2 times per day)
  budget_over: [
    {
      title: 'बजट सीमा पार 🚨',
      body: 'अरे {name}! 🚨 आज का बजट {over} से पार हो गया। कुल खर्च: {spent} (बजट: {budget}) 🛑',
    },
    {
      title: 'बजट अलर्ट 🛑',
      body: 'बजट अलर्ट, {name}! 🛑 आज की सीमा {over} से अधिक हो गई है। बाकी दिन संभलकर चलें 💛',
    },
    {
      title: 'बजट अलर्ट 💛',
      body: 'ध्यान दें {name}: आज का खर्च {spent} हो गया है, जो बजट से {over} अधिक है 💪',
    },
  ],

  // 8. Weekly Report (Sunday 7 PM)
  weekly_report: [
    {
      title: 'साप्ताहिक विवरण 📈',
      body: 'साप्ताहिक विवरण तैयार है, {name}! 📈 इस सप्ताह कुल {spent} खर्च हुए। मुख्य श्रेणी {top_category} रही 🗓️',
    },
    {
      title: 'साप्ताहिक विवरण 🗓️',
      body: 'इस सप्ताह का लेखा-जोखा, {name}! 🗓️ कुल खर्च: {spent}। देखें कैसा रहा यह सप्ताह ✨',
    },
    {
      title: 'साप्ताहिक विवरण ☕',
      body: 'रविवार का सारांश! ☕ इस सप्ताह {spent} खर्च हुए। अगले सप्ताह के लिए तैयार रहें, {name}? 🚀',
    },
  ],

  // 9. Transaction Added (Auto-add)
  transaction_added: [
    {
      title: 'भुगतान दर्ज ⚡',
      body: '{merchant} पर {amount} नामे (डेबिट) हुए • Rupeo में जुड़ गए ⚡',
    },
    {
      title: 'खर्च दर्ज ✅',
      body: '{amount} का भुगतान ({merchant}) सफलतापूर्वक दर्ज हुआ ✅ • समीक्षा के लिए टैप करें',
    },
    {
      title: 'भुगतान दर्ज 📝',
      body: '{merchant} पर {amount} का खर्च दर्ज कर लिया गया है 📝',
    },
  ],
};

// Aliases for short keys
hiMessages.morning = hiMessages.morning_no_budget;
hiMessages.lunch = hiMessages.lunch_no_spent;
hiMessages.lunch_spent = hiMessages.lunch_with_spent;
hiMessages.teatime = hiMessages.teatime_with_budget;
hiMessages.report_under = hiMessages.daily_report_under;
hiMessages.report_over = hiMessages.daily_report_over;
hiMessages.report_zero = hiMessages.daily_report_zero;
