import { FileText, ChevronLeft } from 'lucide-react';

interface TermsOfServiceScreenProps {
  isDark: boolean;
  onClose: () => void;
}

export function TermsOfServiceScreen({ isDark, onClose }: TermsOfServiceScreenProps) {
  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-terms-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <FileText className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Terms of Service</h1>
            </div>
            <div className="w-12" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="h-full overflow-y-auto pb-24">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className={`backdrop-blur-xl rounded-3xl border p-8 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
          }`}>
            {/* Effective Date */}
            <div className={`text-sm mb-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Effective date: 24 November 2025
            </div>

            {/* Introduction */}
            <div className={`mb-8 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
              <p className="mb-4">
                These Terms of Service ("Terms") govern your access to and use of Flo (the "App") and related websites, products, and services (collectively, the "Services") provided by Nuvitae Labs Pty Ltd ("Nuvitae Labs", "we", "us", or "our").
              </p>
              <p className="mb-4">
                By accessing or using the Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.
              </p>
              <div className={`p-4 rounded-xl mt-4 ${
                isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
              }`}>
                <p className="font-medium">Important:</p>
                <p className="text-sm mt-1">
                  The Services do not provide medical advice, diagnosis, or treatment. Always seek the advice of a qualified health professional with any questions about your health.
                </p>
              </div>
            </div>

            {/* Section 1 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                1. Eligibility
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>You must:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Be at least 18 years old (or the age of legal majority in your jurisdiction), and</li>
                  <li>Have the legal capacity to enter into a binding contract.</li>
                </ul>
                <p>
                  By using the Services, you represent and warrant that you meet these requirements and that all information you provide to us is accurate and complete.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                2. Description of the Services
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>The Services provide tools to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Help you collect, store, and visualise health-related data (e.g., lab results, biomarker data, wearable data);</li>
                  <li>Generate AI-powered insights, explanations, and summaries based on that data; and</li>
                  <li>Support you in tracking health and lifestyle trends over time.</li>
                </ul>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <p className="text-sm">
                    The Services are intended for informational and educational purposes only. They are not a substitute for professional medical advice, diagnosis, or treatment.
                  </p>
                </div>
                <p className="text-sm italic">
                  We may update, modify, or discontinue any part of the Services at any time, with or without notice, subject to applicable law.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                3. No Medical Advice & Health Disclaimer
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>The Services:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Do not provide medical, clinical, or therapeutic advice;</li>
                  <li>Do not create a doctor-patient, clinician-patient, or other healthcare professional relationship; and</li>
                  <li>Should not be relied on for decisions about diagnosis, treatment, medication, or any other clinical decision.</li>
                </ul>
                
                <p>You must always:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Consult a qualified healthcare professional before changing any medication, therapy, or lifestyle regimen;</li>
                  <li>Use the Services as a support tool, not as a sole basis for any medical decision.</li>
                </ul>

                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
                }`}>
                  <p className="font-medium mb-2">If you think you may have a medical emergency:</p>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>Call your local emergency number immediately (e.g., 000 in Australia, 911, 112, or your local equivalent) and</li>
                    <li>Do not rely on the App or any communications from it.</li>
                  </ul>
                </div>

                <p className="text-sm">
                  To the maximum extent permitted by law (including the Australian Consumer Law where applicable), Nuvitae Labs disclaims any liability arising from your reliance on:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                  <li>Any content in the App,</li>
                  <li>AI-generated insights, explanations, or recommendations, or</li>
                  <li>Any use of the Services contrary to these Terms.</li>
                </ul>
              </div>
            </section>

            {/* Section 4 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                4. Accounts and Security
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  To use certain features, you may need to create an account and provide accurate, current information.
                </p>
                <p>You are responsible for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maintaining the confidentiality of your login credentials;</li>
                  <li>All activities that occur under your account; and</li>
                  <li>Notifying us promptly if you suspect unauthorised access or misuse.</li>
                </ul>
                <p>We reserve the right, subject to applicable law, to suspend or terminate your account if:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>We suspect fraudulent or abusive activity;</li>
                  <li>You violate these Terms; or</li>
                  <li>Your use poses a risk to other users or to the integrity of the Services.</li>
                </ul>
              </div>
            </section>

            {/* Section 5 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                5. Subscriptions, Fees, and Payments
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Some features of the Services may be offered on a paid subscription basis ("Premium" or similar).
                </p>
                <p>When you subscribe:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You authorise us (and our payment processors) to charge you the applicable fees, plus any applicable taxes;</li>
                  <li>Subscriptions typically renew automatically at the end of each billing period unless you cancel in accordance with the platform's procedures (e.g., App Store, Google Play, or our web platform).</li>
                </ul>
                <p>Prices, subscription tiers, and features may change from time to time, subject to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Any applicable laws, and</li>
                  <li>The renewal terms of your existing subscription.</li>
                </ul>
                <p>To the extent allowed by law and platform rules:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>All fees are non-refundable except where required by law (including under the Australian Consumer Law), or as expressly stated otherwise.</li>
                  <li>Any refunds for in-app purchases via Apple App Store or Google Play must generally be handled through those platforms.</li>
                </ul>
              </div>
            </section>

            {/* Section 6 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                6. Data Sources and Third-Party Integrations
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  The Services may integrate with third-party platforms and data sources (e.g., Apple HealthKit, Google Fit, lab providers, or AI infrastructure providers).
                </p>
                <p>You are responsible for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Ensuring that you have the right to connect these data sources;</li>
                  <li>Reviewing the third party's terms and privacy policy.</li>
                </ul>
                <p>We are not responsible for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The accuracy, completeness, or availability of data from third-party sources; or</li>
                  <li>Any acts or omissions of such third parties.</li>
                </ul>
                <p>By connecting third-party services, you authorise us to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access, store, and process data received from those services solely to provide and improve the Services, in accordance with our Privacy Policy.</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                7. User Content and Data
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>"User Content" includes:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Health data, lab results, biomarker values, wearable data;</li>
                  <li>Text entries (e.g., notes, symptoms, lifestyle logs);</li>
                  <li>Other content you input, upload, or transmit via the Services.</li>
                </ul>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-teal-500/10 border border-teal-500/20' : 'bg-teal-50 border border-teal-200'
                }`}>
                  <p className="font-medium">You retain ownership of your User Content.</p>
                </div>
                <p>By using the Services, you grant Nuvitae Labs a worldwide, non-exclusive, royalty-free licence to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use, store, process, display, and create derivative works from your User Content</li>
                  <li>Solely for the purpose of operating, improving, and providing the Services (including AI-driven features and analytics).</li>
                </ul>
                <p>You represent and warrant that:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You have all necessary rights to upload and share your User Content;</li>
                  <li>Your User Content and use of it within the Services do not violate any law or any third party's rights.</li>
                </ul>
                <p>We may de-identify and aggregate data for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Research and development,</li>
                  <li>Statistical analyses,</li>
                  <li>Improving the Services, and</li>
                  <li>Other lawful business purposes.</li>
                </ul>
                <p className="text-sm italic">De-identified data will not be used to identify you.</p>
              </div>
            </section>

            {/* Section 8 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                8. Privacy
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Our handling of your personal information is governed by our Privacy Policy, which forms part of these Terms.
                </p>
                <p>You can review our Privacy Policy at:</p>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <a 
                    href="https://nuvitaelabs.com/privacy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`underline ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
                  >
                    https://nuvitaelabs.com/privacy
                  </a>
                </div>
                <p>If you have privacy-related questions, you can contact us at:</p>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <a href="mailto:support@nuvitaelabs.com" className={`underline ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    support@nuvitaelabs.com
                  </a>
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                9. Acceptable Use
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>You agree not to do any of the following while using the Services:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violate any applicable law or regulation.</li>
                  <li>Use the Services for any unlawful, harmful, or misleading purpose.</li>
                  <li>Attempt to reverse engineer, decompile, or otherwise derive source code from the Services, except where permitted by law.</li>
                  <li>Circumvent or attempt to circumvent any security or access controls.</li>
                  <li>Upload or transmit any content that:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Is defamatory, harassing, discriminatory, or otherwise objectionable;</li>
                      <li>Contains viruses, malware, or harmful code;</li>
                      <li>Infringes the rights of others (including privacy, intellectual property, or contractual rights).</li>
                    </ul>
                  </li>
                  <li>Interfere with the operation of the Services or with other users' use of the Services.</li>
                  <li>Use bots, scrapers, or other automated means to access the Services, except where expressly allowed by us.</li>
                </ul>
              </div>
            </section>

            {/* Section 10 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                10. Intellectual Property
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>The Services, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Software, code, algorithms, AI models, design, text, graphics, logos, and other content,</li>
                </ul>
                <p>are owned by Nuvitae Labs or our licensors and are protected by intellectual property laws.</p>
                
                <p>Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access and use the Services for your personal, non-commercial use.</li>
                </ul>

                <p>You may not:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Copy, modify, distribute, sell, lease, or create derivative works based on the Services;</li>
                  <li>Remove or alter any copyright, trademark, or other proprietary notices.</li>
                </ul>

                <p className="text-sm">
                  All trademarks, logos, and service marks displayed in the Services are the property of Nuvitae Labs or their respective owners. You may not use them without our prior written consent.
                </p>
              </div>
            </section>

            {/* Section 11 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                11. Beta Features and AI Outputs
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Some parts of the Services (including AI-generated insights) may be offered as beta, preview, or experimental features.
                </p>
                <p>Such features:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Are provided "as is" and may contain errors or inaccuracies;</li>
                  <li>May change or be discontinued at any time;</li>
                  <li>Should not be relied upon as a sole source of truth for medical or other high-stakes decisions.</li>
                </ul>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <p className="text-sm">
                    You understand and agree that:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
                    <li>AI-generated content can be imperfect, incomplete, or incorrect;</li>
                    <li>You remain responsible for verifying any critical information with a qualified professional.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 12 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                12. Disclaimers
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  To the fullest extent permitted by law (including the Australian Consumer Law where applicable):
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The Services are provided on an "as is" and "as available" basis.</li>
                  <li>We do not guarantee that:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>The Services will be uninterrupted, error-free, or secure;</li>
                      <li>The data or insights provided will be accurate, complete, or suitable for any particular purpose.</li>
                    </ul>
                  </li>
                  <li>We disclaim all warranties, express or implied, including:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Warranties of merchantability, fitness for a particular purpose, and non-infringement.</li>
                    </ul>
                  </li>
                </ul>
                <p className="text-sm italic mt-4">
                  Nothing in these Terms excludes, restricts, or modifies any consumer rights or guarantees that cannot be excluded, restricted, or modified under the Australian Consumer Law or other applicable laws.
                </p>
              </div>
            </section>

            {/* Section 13 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                13. Limitation of Liability
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>To the extent permitted by law:</p>
                <p>Nuvitae Labs and its directors, officers, employees, contractors, and affiliates will not be liable for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Any indirect, consequential, incidental, special, or punitive damages;</li>
                  <li>Any loss of profits, revenue, data, or goodwill;</li>
                  <li>Any damage resulting from:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Your use or inability to use the Services;</li>
                      <li>Any reliance on information or insights provided by the Services;</li>
                      <li>Any unauthorised access to or use of your account or data.</li>
                    </ul>
                  </li>
                </ul>
                <div className={`p-4 rounded-xl mt-4 ${
                  isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <p className="text-sm">
                    Where liability cannot be excluded but may be limited (including under Australian law), our total liability arising out of or in connection with the Services or these Terms will, to the extent permitted by law, be limited to:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
                    <li>The amount you paid for the Services in the 3 months preceding the event giving rise to the claim; or</li>
                    <li>AUD $100, whichever is greater.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 14 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                14. Indemnification
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  To the maximum extent permitted by law, you agree to indemnify, defend, and hold harmless Nuvitae Labs and its affiliates, directors, officers, employees, and agents from any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in connection with:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your use of or access to the Services;</li>
                  <li>Your violation of these Terms;</li>
                  <li>Your infringement of any third party's rights;</li>
                  <li>Any User Content you provide.</li>
                </ul>
              </div>
            </section>

            {/* Section 15 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                15. Termination
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  You may stop using the Services at any time by deleting your account or ceasing to access the Services.
                </p>
                <p>We may, at our discretion and subject to applicable law:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Suspend or terminate your access if you breach these Terms or engage in misconduct;</li>
                  <li>Discontinue the Services at any time, with reasonable notice where practicable.</li>
                </ul>
                <p>Upon termination:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your licence to use the Services ends immediately;</li>
                  <li>We may retain or delete your data in accordance with our Privacy Policy and applicable law;</li>
                  <li>Provisions of these Terms that by their nature should survive (e.g., disclaimers, limitation of liability, indemnification) will remain in effect.</li>
                </ul>
              </div>
            </section>

            {/* Section 16 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                16. Changes to These Terms
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  We may update these Terms from time to time to reflect changes in law, product features, or business practices.
                </p>
                <p>We will notify you of material changes by:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Posting an updated version on our website or app;</li>
                  <li>Sending you an email or in-app notification where appropriate.</li>
                </ul>
                <p>
                  Your continued use of the Services after the revised Terms take effect constitutes acceptance of those Terms. If you do not agree, you should stop using the Services.
                </p>
              </div>
            </section>

            {/* Section 17 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                17. Governing Law and Dispute Resolution
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  These Terms are governed by and construed in accordance with the laws of the State of Victoria, Australia.
                </p>
                <p>
                  Any dispute arising under or in connection with these Terms will be subject to the exclusive jurisdiction of the courts of Victoria, Australia, unless otherwise required by law.
                </p>
                <p className="text-sm italic">
                  Nothing in this clause limits any rights you may have under the Australian Consumer Law or other consumer protection statutes.
                </p>
              </div>
            </section>

            {/* Section 18 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                18. General
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Entire Agreement:</strong> These Terms (together with our Privacy Policy) constitute the entire agreement between you and Nuvitae Labs regarding the Services.</li>
                  <li><strong>Severability:</strong> If any provision is found to be unenforceable, the remaining provisions will remain in full force and effect.</li>
                  <li><strong>No Waiver:</strong> Our failure to enforce any right or provision of these Terms will not constitute a waiver of such right or provision.</li>
                  <li><strong>Assignment:</strong> You may not assign or transfer your rights under these Terms without our prior written consent. We may assign our rights without restriction.</li>
                </ul>
              </div>
            </section>

            {/* Section 19 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                19. Contact Us
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>If you have questions or concerns about these Terms, please contact us:</p>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <p className="font-medium mb-2">Nuvitae Labs Pty Ltd</p>
                  <p>Email: <a href="mailto:support@nuvitaelabs.com" className={`underline ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>support@nuvitaelabs.com</a></p>
                  <p>Website: <a href="https://nuvitaelabs.com" target="_blank" rel="noopener noreferrer" className={`underline ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>nuvitaelabs.com</a></p>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
