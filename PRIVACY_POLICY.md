# Privacy Policy for Rupeo

**Effective Date:** October 6, 2026  
**Version:** 2.2  
**Application Name:** Rupeo  
**Package Name:** `com.innovatexlabs.paisewaise`  
**Publisher / Developer:** Innovatex Labs  
**Official Portal / Download:** https://rupeoo.vercel.app/download  
**Contact Email:** innovatexlab.services@gmail.com  

---

## 1. Introduction
Innovatex Labs ("we", "us", or "our") develops and operates the **Rupeo** personal finance, budgeting, and bookkeeping application. We are committed to transparency, user privacy, and rigorous data protection. This Privacy Policy details our principles and practices regarding the collection, use, processing, storage, and protection of personal and financial information when you access or use Rupeo on Android or iOS devices.

By installing, registering, accessing, or using Rupeo, you consent to the collection and use of your information in accordance with this Privacy Policy.

---

## 2. Information We Collect

### A. Account & Profile Information
When you create an account or sign in to Rupeo:
- **Email & Display Name:** Used to authenticate your account, synchronize your financial records, and personalize your experience.
- **Profile Photo URL:** If signing in via Google Sign-In, we store your public Google profile avatar URL to display within your in-app profile.
- **Firebase Authentication UID:** A unique, anonymized identifier assigned to your account for secure cloud data isolation.

### B. Financial Transactions & Ledger Data
Rupeo is an expense tracking, budgeting, and bookkeeping utility where you may input:
- **Transaction Records:** Income and expense amounts, timestamps, payment modes (UPI, Cash, Debit/Credit Card, Net Banking).
- **Categories:** System-defined or custom user categories (e.g., Food, Groceries, Shopping, Bills, Fuel, Health, Salary, Freelance, Investments).
- **Descriptions & Memos:** Custom text notes or remarks attached to transactions.
- **Budget Benchmarks & Goals:** Monthly category spending targets, daily limits, and overall budget allocations.

### C. Voice Input & Audio Processing (Voice Quick Add)
Rupeo features a **Voice Quick Add** capability allowing you to log expenses and income using voice commands:
- **Speech Recognition:** Your spoken audio is converted to text using on-device Speech Recognition APIs (Android SpeechRecognizer / iOS Speech / Web Speech API).
- **On-Device Parsing:** Spoken phrases (e.g., *"Chai 20 rupaye"*, *"Auto 50"*) are analyzed locally solely to identify transaction amounts and categories.
- **Strict Audio Privacy:** **Rupeo does NOT record, upload, retain, or store your raw voice recordings on any remote server.** Audio processing is ephemeral and ceases immediately after speech-to-text recognition completes. We do not sell or share voice data with third-party data brokers.

### D. Friends & Udhar (Peer-to-Peer Khata)
When you use the Friends & Udhar tracking feature:
- **Friend Contact Details:** Names and optional mobile numbers you provide for contacts with whom you track shared expenses, split bills, or loans.
- **Ledger Entries:** Lent ("Gave") and borrowed ("Got") amounts, payment notes, and settlement records.
- **Privacy:** Friends and ledger data are isolated under your personal authenticated Firestore account and are never accessible to other users or third parties.

### E. Contacts Information (Optional)
- **Contact Selection:** With your explicit runtime permission (`android.permission.READ_CONTACTS`), Rupeo allows you to conveniently select friend names and numbers from your address book for the Friends & Udhar ledger.
- **No Contact Scraping:** **We do NOT upload, scrape, store, or transmit your entire contact list to our servers.** Only the specific contact(s) you actively choose to add to your ledger are saved in your personal account.

### F. UPI QR Generation & Payment Requests
- **UPI ID (VPA):** When generating a Split UPI QR code or requesting payment from friends, your provided UPI Virtual Payment Address (e.g., `username@bank`) is used solely to construct standard NPCI UPI payment deep links (`upi://pay?...`) and rendered into scannable QR passes.
- **QR Pass Capture:** The app generates a local graphical payment pass image on your device that you can voluntarily share via WhatsApp or system share dialogs.

### G. Receipts & Bill Images
- **Physical Bills & Invoices:** Photos you capture using your device camera or select from your photo library.
- **Storage:** Receipt images are compressed and stored securely via Cloudinary CDN, linked strictly to your authenticated account.

### H. Recurring Bill Reminders
- **Utility & Subscription Reminders:** Service provider names (e.g., Jio, Airtel, Vi, BSNL, Rent, Tiffin/Mess, Milk Delivery, Maid Salary, Electricity, Water, WiFi, EMI), billing frequency, amount due, and due dates.

### I. Device, Widget & Diagnostic Data
- **Android Home Screen Widgets:** Home screen widget data (Today's spend summary and remaining budget) is rendered locally on your device via Android RemoteViews.
- **Device Model & OS Version:** Used to optimize user interface performance and maintain compatibility.
- **Push Notification Tokens:** Managed through Expo Notifications to deliver scheduled bill reminders and budget alerts.
- **Crash Telemetry:** Aggregated, non-identifiable telemetry to resolve app crashes and improve reliability.

---

## 3. What We DO NOT Collect
To protect your financial security:
- **No Bank Credentials:** Rupeo never asks for, records, or stores your net-banking passwords, ATM PINs, UPI MPINs, or card CVVs.
- **No Direct Fund Custody:** Rupeo is not a payment gateway, bank, or digital wallet. It does not hold, transmit, receive, or process actual money.
- **No Unauthorized SMS Scraping:** Rupeo does not read non-consented personal SMS messages.

---

## 4. Device Permissions & Justification

| Permission | Technical Name | Purpose |
| :--- | :--- | :--- |
| **Microphone** | `android.permission.RECORD_AUDIO` | Enables hands-free Voice Quick Add to transcribe expense amounts and categories. Audio is processed on-device and never stored remotely. |
| **Contacts** | `android.permission.READ_CONTACTS` | Allows you to quickly select friend names and numbers when adding contacts to the Friends & Udhar bookkeeping ledger. |
| **Camera** | `android.permission.CAMERA` | Allows you to photograph physical bill receipts, invoices, or payment confirmations. |
| **Media / Photos** | `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` | Allows you to choose receipt photos from your gallery and save exported receipts/PDFs. |
| **Notifications** | `android.permission.POST_NOTIFICATIONS` | Delivers timely bill due date alerts, recharge expiration warnings, and budget notifications. |

---

## 5. How We Use Your Information
We use your information exclusively to provide and improve the Rupeo service:
1. Synchronizing transactions, friends ledger, and bill reminders across your registered devices.
2. Generating analytics: cash flow trends, spending waves, and category breakdowns.
3. Rendering authentic scannable ISO/IEC 16388 Code 39 barcode receipts for personal records.
4. Delivering AI-powered spending summaries and smart budget advice.
5. Providing Split UPI QR codes and payment request passes for peer-to-peer tracking.
6. Managing optional VIP / Pro subscription features.

**We do NOT sell, rent, monetize, or trade your personal or financial records to data brokers or third-party advertisers.**

---

## 6. Third-Party Service Providers
We partner with certified third-party providers who process data strictly on our behalf:
- **Google Firebase (Google LLC):** Authentication, Cloud Firestore encrypted database, and cloud infrastructure.
- **Google Mobile Ads (AdMob):** Displays banner and interstitial advertisements for free-tier users in compliance with Google Play Developer policies.
- **Cloudinary:** High-speed cloud image optimization and encrypted storage for bill receipts.
- **Google Play In-App Billing (`react-native-iap`):** Processes VIP/Pro subscription transactions securely without Rupeo ever handling credit card numbers.

---

## 7. Data Security & Storage
- **Encryption in Transit:** All network communication uses TLS 1.3 / HTTPS encryption.
- **User-Level Access Isolation:** Cloud Firestore security rules ensure that only your authenticated account can access or modify your records.
- **Local Sandbox Storage:** Offline cached data is stored securely in sandboxed application storage (`AsyncStorage`).

---

## 8. Data Ownership, Export & Deletion Rights
- **Data Ownership:** You own 100% of your financial information.
- **Data Export:** You can export your data at any time in CSV, PDF, or JSON backup formats via Settings.
- **Right to Erasure (Account Deletion):** You have the right to permanently erase your account at any time. Simply navigate to **Settings > Delete My Account**. This action permanently and irreversibly purges your profile, all transactions, friends khata entries, recurring bills, notifications, and uploaded photos from our active servers.

---

## 9. Children's Privacy
Rupeo is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13.

---

## 10. Changes to This Privacy Policy
We may update this Privacy Policy periodically. We will notify you of any changes by updating the "Effective Date" at the top of this document and publishing the updated policy inside the app.

---

## 11. Contact Us
If you have any questions, concerns, or requests regarding this Privacy Policy, please contact our support team at:
- **Email:** innovatexlab.services@gmail.com  
- **Publisher:** Innovatex Labs  
- **Website:** https://rupeoo.vercel.app/download  
