import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export interface LegalModalProps {
  visible: boolean;
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  visible,
  type,
  onClose,
}) => {
  if (!visible || !type) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Full Page Header */}
        <View style={styles.fullPageHeader}>
          <TouchableOpacity onPress={onClose} style={styles.fullPageBackBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={28} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.fullPageTitle}>
            {type === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Scrollable Legal Document Content */}
        <ScrollView style={styles.fullPageContent} showsVerticalScrollIndicator={false}>
          {type === 'privacy' ? (
            <View style={{ paddingBottom: 60 }}>
              <Text style={styles.legalTextBold}>Rupeo Privacy Policy</Text>
              <Text style={styles.legalDateText}>Effective Date: October 6, 2026 | Version 2.2</Text>

              <Text style={styles.legalIntroText}>
                Innovatex Labs ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how our personal finance and bookkeeping application Rupeo ("App", package: com.innovatexlabs.paisewaise, portal: https://rupeoo.vercel.app/download) collects, uses, protects, and handles your personal and financial information.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>1. Information We Collect</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Account & Identity:</Text> When you register using Email/Password or Google Sign-In, we collect your display name, email address, profile picture URL, and Firebase Auth UID.{'\n'}
                • <Text style={styles.legalTextSemibold}>Financial Transactions:</Text> Income and expense amounts, transaction timestamps, payment modes (UPI, Cash, Debit/Credit Card, Net Banking), category allocations, and optional notes/memos.{'\n'}
                • <Text style={styles.legalTextSemibold}>Voice Input (Voice Quick Add):</Text> Spoken phrases are processed locally using on-device Speech Recognition APIs to transcribe amounts and categories. Audio recordings are never uploaded, stored, or shared remotely.{'\n'}
                • <Text style={styles.legalTextSemibold}>Friends & Udhar (Khata):</Text> Peer contact names and optional phone numbers entered to track shared expenses, lent ("Gave"), and borrowed ("Got") amounts.{'\n'}
                • <Text style={styles.legalTextSemibold}>Split UPI QR Generation:</Text> Your UPI ID (VPA) is used locally to create standard NPCI UPI payment deep links (`upi://pay?...`) and rendered into scannable passes for sharing.{'\n'}
                • <Text style={styles.legalTextSemibold}>Receipts & Bill Images:</Text> Physical receipt photos, invoices, and payment proof screenshots that you voluntarily take using the in-app camera or select from your photo library (stored securely via Cloudinary).{'\n'}
                • <Text style={styles.legalTextSemibold}>Recurring Bill Reminders:</Text> Bill provider names (e.g. Jio, Airtel, Vi, BSNL, Rent, Tiffin/Mess, Milk, Maid, Electricity, EMI), bill amounts, billing cycles, and next due dates.{'\n'}
                • <Text style={styles.legalTextSemibold}>Widgets & Diagnostics:</Text> Home screen widgets render local spend summaries via Android RemoteViews. Device model, OS version, push notification tokens, and anonymous crash telemetry ensure app reliability.{'\n\n'}
                <Text style={styles.legalHighlightText}>What We DO NOT Collect:</Text> Rupeo never collects or stores your bank login passwords, net banking credentials, ATM PINs, UPI MPINs, or card CVV numbers. Rupeo does not link directly to bank accounts and does not hold user funds.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>2. Device Permissions We Request</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Microphone (RECORD_AUDIO):</Text> Enables hands-free Voice Quick Add to transcribe expense amounts and categories. Audio is processed on-device and never stored remotely.{'\n'}
                • <Text style={styles.legalTextSemibold}>Contacts (READ_CONTACTS):</Text> Allows you to select friend names and numbers when adding contacts to the Friends & Udhar ledger. Your contacts list is never uploaded or scraped.{'\n'}
                • <Text style={styles.legalTextSemibold}>Camera (CAMERA):</Text> Used solely to allow you to photograph bills, receipts, or payment confirmations directly within the app.{'\n'}
                • <Text style={styles.legalTextSemibold}>Photos & Documents (System Photo Picker):</Text> Uses Android's secure system photo picker to let you attach receipt images without requiring broad media storage permissions.{'\n'}
                • <Text style={styles.legalTextSemibold}>Notifications (POST_NOTIFICATIONS):</Text> Used to deliver timely alerts for upcoming bill due dates, recharge expirations, and budget status.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>3. How We Use Your Data</Text>
              <Text style={styles.legalText}>
                • To manage, display, and securely synchronize your personal accounts, friends ledger, and transactions across devices.{'\n'}
                • To calculate financial statistics, category breakdowns, and cash flow trends.{'\n'}
                • To generate authentic encrypted digital transaction receipts and Split UPI payment request passes.{'\n'}
                • To provide AI-powered financial summaries and smart spending recommendations.{'\n'}
                • To handle optional VIP / Pro subscription features.{'\n'}
                • <Text style={styles.legalTextSemibold}>No Sale of Data:</Text> We do not sell, rent, or trade your personal or financial data to third-party advertisers or data brokers.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>4. Third-Party Services</Text>
              <Text style={styles.legalText}>
                We integrate trusted third-party services that adhere to stringent privacy and security standards:{'\n'}
                • <Text style={styles.legalTextSemibold}>Google Firebase (Google LLC):</Text> Secure authentication, Cloud Firestore encrypted database, and cloud infrastructure.{'\n'}
                • <Text style={styles.legalTextSemibold}>Google Mobile Ads (AdMob):</Text> Displays non-intrusive banner and video ads for free-tier users in accordance with Google Play Developer policies.{'\n'}
                • <Text style={styles.legalTextSemibold}>Cloudinary:</Text> High-speed encrypted media storage and delivery for attached bill photos.{'\n'}
                • <Text style={styles.legalTextSemibold}>Google Play Billing (react-native-iap):</Text> Securely processes in-app VIP/Pro subscriptions without Rupeo accessing credit card details.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>5. Data Security & Encryption</Text>
              <Text style={styles.legalText}>
                • All network communication uses end-to-end TLS 1.3 / HTTPS encryption.{'\n'}
                • Firestore security rules enforce strict user-level access isolation — only your authenticated account can access your records.{'\n'}
                • Offline local cached data is protected within your device's sandboxed storage.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>6. Your Rights: Export & Permanent Data Deletion</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Data Ownership:</Text> You retain 100% ownership of your data.{'\n'}
                • <Text style={styles.legalTextSemibold}>Data Export:</Text> You can export all your records anytime in CSV, PDF, or JSON backup formats.{'\n'}
                • <Text style={styles.legalTextSemibold}>Account Deletion:</Text> You have the right to permanently erase your account at any time via Settings {'>'} "Delete My Account". This action permanently and irreversibly purges your profile, all transactions, friends khata records, recurring bills, notifications, and uploaded photos from our active servers.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>7. Children's Privacy</Text>
              <Text style={styles.legalText}>
                Rupeo is not intended for use by children under 13 years of age. We do not knowingly collect personal data from children.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>8. Contact & Portal</Text>
              <Text style={styles.legalText}>
                For any privacy questions or data requests, please contact:{'\n'}
                <Text style={styles.legalTextSemibold}>Email:</Text> innovatexlab.services@gmail.com{'\n'}
                <Text style={styles.legalTextSemibold}>Publisher:</Text> Innovatex Labs{'\n'}
                <Text style={styles.legalTextSemibold}>Portal:</Text> https://rupeoo.vercel.app/download
              </Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 60 }}>
              <Text style={styles.legalTextBold}>Rupeo Terms & Conditions</Text>
              <Text style={styles.legalDateText}>Effective Date: October 6, 2026 | Version 2.2</Text>

              <Text style={styles.legalIntroText}>
                Please read these Terms & Conditions ("Terms") carefully before using the Rupeo mobile application (package: com.innovatexlabs.paisewaise, portal: https://rupeoo.vercel.app/download) operated by Innovatex Labs ("we", "us", or "our"). By downloading, installing, or using Rupeo, you agree to these Terms.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>1. Acceptance of Terms</Text>
              <Text style={styles.legalText}>
                By accessing or using Rupeo, you confirm that you are at least 13 years of age and possess the legal capacity to enter into these Terms. If you do not agree to these Terms, please do not use the application.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>2. Service Description & Financial Disclaimer</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Personal Bookkeeping Utility:</Text> Rupeo is a personal expense tracker, budgeting tool, peer khata (Friends & Udhar), voice logger, and bill reminder application.{'\n'}
                • <Text style={styles.legalTextSemibold}>Not a Financial Advisor:</Text> Rupeo is not a registered financial advisor, bank, or tax professional. Any spending wave graphs, AI financial insights, or category reports are for informational and personal organization purposes only. You are solely responsible for your financial decisions.{'\n'}
                • <Text style={styles.legalTextSemibold}>No Banking or Fund Custody:</Text> Rupeo does not hold, transmit, custody, deposit, or withdraw real currency.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>3. Voice Quick Add & Permissions</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Voice Parsing:</Text> Speech recognition processes audio locally to transcribe amounts and categories. Audio files are not stored on remote servers.{'\n'}
                • <Text style={styles.legalTextSemibold}>Verification:</Text> Users are responsible for confirming auto-populated transaction amounts before or after saving.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>4. Friends, Udhar & Split UPI QR Generation</Text>
              <Text style={styles.legalText}>
                • <Text style={styles.legalTextSemibold}>Peer-to-Peer Khata:</Text> Friends & Udhar entries represent personal bookkeeping records between you and your peers. Rupeo is not a party to any loan, debt, or settlement.{'\n'}
                • <Text style={styles.legalTextSemibold}>UPI QR Passes:</Text> QR codes generated with your UPI ID link directly to standard NPCI UPI protocols. Payments are processed entirely outside Rupeo through your third-party UPI apps (Google Pay, PhonePe, Paytm, etc.). Innovatex Labs holds no liability for payment transfers or erroneous details.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>5. User Account & Security</Text>
              <Text style={styles.legalText}>
                • You are responsible for safeguarding your login credentials and for all activities that occur under your account.{'\n'}
                • You agree to provide accurate information and not impersonate any person or entity.{'\n'}
                • You must immediately notify us of any suspected unauthorized access to your account.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>6. Receipts & Shared Documents</Text>
              <Text style={styles.legalText}>
                • Rupeo provides tamper-proof digital receipt sharing and personal expense verification.{'\n'}
                • You are solely responsible for ensuring the legality, authenticity, and accuracy of any images or transaction receipts that you upload, export, or share with third parties.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>7. In-App Purchases & VIP Subscriptions</Text>
              <Text style={styles.legalText}>
                • Rupeo offers optional VIP / Pro subscriptions that remove advertisements, provide unlimited bill reminders, and unlock premium report exports.{'\n'}
                • Payments are processed securely via Google Play In-App Billing (or Apple App Store). Subscriptions renew automatically unless cancelled at least 24 hours before the renewal date in your Google Play Store Account Settings.{'\n'}
                • All refunds are governed by Google Play Store standard refund policies.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>8. Intellectual Property & Prohibited Activities</Text>
              <Text style={styles.legalText}>
                • The Rupeo app, brand logo, software code, UI design, animations, and icons are the exclusive intellectual property of Innovatex Labs.{'\n'}
                • You agree not to decompile, reverse-engineer, exploit, or disrupt any part of the service.{'\n'}
                • We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive behavior.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>9. Limitation of Liability</Text>
              <Text style={styles.legalText}>
                To the maximum extent permitted by applicable law, Innovatex Labs and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the service, data loss, payment disputes, or reliance on information presented in the app.{'\n\n'}
              </Text>

              <Text style={styles.legalSectionHeading}>10. Governing Law & Contact</Text>
              <Text style={styles.legalText}>
                These Terms shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.{'\n\n'}
                For support or inquiries, please contact:{'\n'}
                <Text style={styles.legalTextSemibold}>Email:</Text> innovatexlab.services@gmail.com{'\n'}
                <Text style={styles.legalTextSemibold}>Publisher:</Text> Innovatex Labs{'\n'}
                <Text style={styles.legalTextSemibold}>Portal:</Text> https://rupeoo.vercel.app/download
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  fullPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  fullPageBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fullPageTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  fullPageContent: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 6,
  },
  legalText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 23,
    fontWeight: '500',
  },
  legalTextBold: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  legalDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 12,
  },
  legalIntroText: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 21,
    fontWeight: '500',
  },
  legalSectionHeading: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 8,
  },
  legalTextSemibold: {
    fontWeight: '800',
    color: '#1E293B',
  },
  legalHighlightText: {
    fontWeight: '800',
    color: '#DC2626',
  },
});
