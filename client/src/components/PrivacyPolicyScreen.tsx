import { Shield, ChevronLeft } from 'lucide-react';

interface PrivacyPolicyScreenProps {
  isDark: boolean;
  onClose: () => void;
}

export function PrivacyPolicyScreen({ isDark, onClose }: PrivacyPolicyScreenProps) {
  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${
        isDark
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900'
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}
    >
      {/* Header with iOS safe area */}
      <div
        className={`sticky top-0 z-50 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
        }`}
      >
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-back-privacy"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Shield className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Privacy Policy</h1>
            </div>
            <div className="w-12" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="h-full overflow-y-auto pb-24">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div
            className={`backdrop-blur-xl rounded-3xl border p-8 ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
            }`}
          >
            {/* Last Updated */}
            <div className={`text-sm mb-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Last updated: 18 December 2025
            </div>

            {/* Introduction */}
            <div className={`mb-8 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
              <p className="mb-4">
                This Privacy Policy explains how Nuvitae ("Nuvitae Labs", "we", "us", or "our") collects, uses,
                discloses, and protects your information when you use the Flō application, website, and related services
                (collectively, the "Service").
              </p>
              <p className="mb-4">
                Flō is a health and longevity optimisation platform. Some information processed through the Service may
                be sensitive health information. We treat it with extra care and apply additional protections and access
                controls.
              </p>
              <p>
                By using Flō, you agree to the collection and use of information in accordance with this Privacy Policy.
                If you do not agree, please do not use the Service.
              </p>
            </div>

            {/* Section 1 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                1. Who We Are
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>Flō is a health and longevity optimisation platform owned and operated by:</p>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <p className="font-medium">Nuvitae Labs Pty Ltd</p>
                  <p className="text-sm">Email: privacy@nuvitaelabs.com</p>
                </div>
                <p>
                  If you are located in the European Economic Area (EEA), United Kingdom (UK), Australia, or another
                  region with data protection laws, Nuvitae Labs is the data controller of your personal information
                  processed through the Service.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                2. What This Policy Covers
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>This Policy applies to personal information we collect when you:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use the Flō mobile or web app</li>
                  <li>Visit our websites</li>
                  <li>Communicate with us (e.g., support, email, social media)</li>
                  <li>Participate in beta programs, surveys, or promotions</li>
                </ul>
                <p>It does not apply to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    Third-party services you connect to Flō (e.g., Apple HealthKit, Google Fit, lab portals), which have
                    their own privacy policies.
                  </li>
                  <li>Websites or services that we do not control.</li>
                </ul>
                <p>
                  This Policy is designed to be international in scope. Depending on where you live, additional rights
                  and rules may apply under local laws such as:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>EU/EEA General Data Protection Regulation (GDPR)</li>
                  <li>UK GDPR and UK Data Protection Act</li>
                  <li>Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs)</li>
                  <li>Other national or state privacy laws in your jurisdiction</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                3. Types of Data We Collect
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Because Flō is a health-focused app, some of the information we process is sensitive health data. We
                  treat this with extra care.
                </p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  3.1 Information You Provide Directly
                </h3>

                <div>
                  <p className="font-medium mb-2">Account information</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Name or nickname</li>
                    <li>Email address</li>
                    <li>Password or login tokens</li>
                    <li>Region / time zone</li>
                    <li>Subscription and billing status (where applicable)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium mb-2">Profile &amp; health information</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Year of birth (and/or age), biological sex (if provided)</li>
                    <li>Height, weight, body composition and related metrics</li>
                    <li>Lifestyle data you log (e.g., exercise, sleep, habits, events, notes)</li>
                    <li>Goals, preferences, and settings (e.g., notification preferences, health targets)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium mb-2">Health &amp; diagnostic data</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Lab results and biomarkers (e.g., blood tests you upload or enter)</li>
                    <li>Diagnostic reports (e.g., DEXA, CAC, imaging summaries)</li>
                    <li>Other health reports or PDFs you upload</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium mb-2">Content you submit</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Messages you send to our in-app assistants / AI features (only when enabled)</li>
                    <li>Support requests, feedback, surveys, beta feedback</li>
                  </ul>
                </div>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  3.2 Information We Collect Automatically
                </h3>
                <p>When you use Flō, we may automatically collect:</p>

                <div>
                  <p className="font-medium mb-2">Device and usage information</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Device type, operating system, app version</li>
                    <li>IP address, approximate location (country/region, not precise GPS)</li>
                    <li>Log data (timestamps, pages/screens visited, features used, crash reports)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium mb-2">Cookies and similar technologies (on web)</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Session cookies to keep you logged in</li>
                    <li>Analytics cookies to understand how the Service is used</li>
                  </ul>
                  <p className="text-sm mt-2">You can control cookies through your browser settings.</p>
                </div>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  3.3 Data from Third-Party Sources
                </h3>
                <p>With your explicit permission, we may connect to and import data from:</p>

                <div>
                  <p className="font-medium mb-2">Wearable / health platforms</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Apple HealthKit</li>
                    <li>(In future) Google Fit, Garmin, or similar services</li>
                  </ul>
                  <p className="text-sm italic mt-2">
                    We do not sell, share, or use HealthKit data for advertising or marketing.
                  </p>
                </div>

                <div>
                  <p className="font-medium mb-2">Laboratory portals or uploads</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Lab results you upload as PDFs or images</li>
                    <li>Data extracted from those reports via AI/OCR (only when enabled)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium mb-2">Third-party sign-in providers</p>
                  <p>
                    If/when we support "Sign in with…" methods (e.g., Apple/Google), we may receive your name, email
                    address, and a token to identify your account.
                  </p>
                </div>

                <p className="text-sm italic mt-4">
                  We will only access, use, and store these data to provide and improve the Service and in line with
                  this Privacy Policy and any platform terms (e.g., Apple HealthKit policies).
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                4. How We Use Your Information
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>We use your personal information for the following purposes:</p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.1 To Provide and Maintain the Service
                </h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Create and manage your Flō account</li>
                  <li>Sync and normalise health, lab, and wearable data</li>
                  <li>Generate dashboards, insights, readiness scores, and other features</li>
                  <li>Provide personalised views, analytics, and trends over time</li>
                </ul>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.2 To Power AI-Driven Features (Opt-In)
                </h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    Use your health and lifestyle data to generate personalised insights, explanations, and
                    recommendations via AI models (when enabled)
                  </li>
                  <li>Extract and structure information from uploaded reports (e.g., lab PDFs) (when enabled)</li>
                  <li>Improve the accuracy of predictions and pattern detection (e.g., correlations between sleep, training, biomarkers)</li>
                </ul>

                <div
                  className={`p-4 rounded-xl mt-4 ${
                    isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <p className="font-medium mb-2">Third-Party AI Providers</p>
                  <p className="text-sm mb-3">
                    To deliver AI-powered features, we use trusted third-party providers who process data on our behalf:
                  </p>
                  <ul className="text-sm space-y-1 pl-4">
                    <li>• <strong>Google AI (Gemini)</strong> – Insight generation, pattern analysis, conversational AI, voice assistant</li>
                    <li>• <strong>OpenAI</strong> – Lab report analysis and data extraction</li>
                  </ul>
                  <p className="text-sm mt-3 italic">
                    These providers may retain data for limited periods for abuse prevention, fraud detection, safety,
                    and service reliability in accordance with their terms and policies.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl mt-4 ${
                    isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'
                  }`}
                >
                  <p className="font-medium mb-2">De-identification &amp; Pseudonymous Processing</p>
                  <p className="text-sm">
                    Before sending any data to AI providers, we remove direct identifiers such as your name and email
                    address and use pseudonymous identifiers for processing. Your account information and your health
                    data are stored separately for additional privacy protection.
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Important:</strong> Depending on your location and context, data may still be considered
                    personal information even if direct identifiers are removed. We treat it accordingly and apply
                    security and contractual controls.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl mt-4 ${
                    isDark ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'
                  }`}
                >
                  <p className="font-medium mb-2">Your Consent Controls</p>
                  <p className="text-sm">
                    AI features are opt-in. You can enable or disable AI data processing at any time in Settings {'>'}{' '}
                    Data &amp; Privacy. When disabled, your health data will not be sent to third-party AI services for
                    AI features.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl mt-4 ${
                    isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                  }`}
                >
                  <p className="font-medium">Important:</p>
                  <p className="text-sm mt-1">
                    AI features are used for educational and informational purposes only. They are not a substitute for
                    professional medical advice, diagnosis, or treatment.
                  </p>
                </div>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.3 To Personalise AI Responses (Without Storing Chat History)
                </h3>
                <p>
                  We do not store AI chat transcripts or full AI conversation history. To support personalisation, we
                  may extract and store limited keywords or topics from your interactions (for example, preferences or
                  recurring themes) to help the AI respond more relevantly over time.
                </p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.4 To Communicate With You
                </h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Send service-related emails or push notifications (e.g., important changes, critical alerts, security messages)</li>
                  <li>Respond to support requests, bug reports, and feedback</li>
                  <li>Provide optional tips, product updates, and marketing communications (where permitted by law and your preferences)</li>
                </ul>
                <p className="text-sm italic">You can opt out of non-essential marketing communications at any time.</p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.5 To Improve and Protect Our Service
                </h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Monitor usage, performance, and app stability</li>
                  <li>Analyse aggregated/anonymous usage patterns to improve features</li>
                  <li>Detect, prevent, and address technical issues, fraud, or misuse</li>
                  <li>Develop new features and services</li>
                </ul>
                <p className="text-sm italic">Where possible, we use de-identified or aggregated data for analytics and product improvement.</p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  4.6 Legal Bases for Processing (EEA/UK &amp; Similar Jurisdictions)
                </h3>
                <p>
                  If you are in the EEA, UK, or another region requiring a legal basis, we process your personal data
                  under one or more of the following:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Consent:</strong> e.g., connecting Apple HealthKit, uploading lab results, enabling notifications, enabling AI features.</li>
                  <li><strong>Contract:</strong> processing necessary to provide the Service you signed up for.</li>
                  <li><strong>Legitimate interests:</strong> e.g., improving the Service, preventing abuse, securing our systems – where these interests are not overridden by your rights and interests.</li>
                  <li><strong>Legal obligation:</strong> where we are required to comply with applicable laws.</li>
                </ul>
                <p className="text-sm italic mt-2">
                  You may withdraw your consent at any time via in-app settings or by contacting us, but this may limit
                  certain functionality.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                5. How We Share Your Information
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <div
                  className={`p-4 rounded-xl ${
                    isDark ? 'bg-teal-500/10 border border-teal-500/20' : 'bg-teal-50 border border-teal-200'
                  }`}
                >
                  <p className="font-medium">We do not sell your personal information.</p>
                </div>

                <p>
                  We do not sell, share, or use any user data for advertising or marketing purposes.
                </p>

                <p>We may share your personal information in the following limited circumstances:</p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  5.1 Service Providers &amp; Sub-Processors
                </h3>
                <p>
                  We use trusted third-party providers to help us operate and improve the Service (e.g., hosting,
                  databases, analytics, email delivery, error tracking, AI model providers).
                </p>
                <p>These providers may process your personal information only on our behalf, under contracts that require:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Only using the data for our specified purposes</li>
                  <li>Keeping the data secure and confidential</li>
                  <li>Complying with applicable data protection laws</li>
                </ul>

                <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <p className="font-medium mb-2">Our core providers include:</p>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li><strong>Neon</strong> – account/profile and subscription information storage</li>
                    <li><strong>Supabase</strong> – storage of pseudonymous health data</li>
                    <li><strong>ClickHouse</strong> – mirrored copy of pseudonymous health data for analytics/machine learning</li>
                    <li><strong>Resend</strong> – email delivery (service and account communications)</li>
                    <li><strong>Google (Gemini) &amp; OpenAI</strong> – AI processing when AI features are enabled</li>
                  </ul>
                </div>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  5.2 Integrations You Authorise
                </h3>
                <p>
                  If you explicitly connect third-party services (e.g., Apple HealthKit, other health apps), we will
                  process data as necessary to provide the integration you requested.
                </p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  5.3 Legal Obligations &amp; Safety
                </h3>
                <p>We may disclose information if we believe in good faith that such disclosure is reasonably necessary to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Comply with a legal obligation, court order, or lawful request from authorities</li>
                  <li>Protect the rights, property, or safety of Nuvitae Labs, our users, or the public</li>
                  <li>Enforce our Terms of Use or other agreements</li>
                </ul>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  5.4 Business Transfers
                </h3>
                <p>
                  If Nuvitae Labs is involved in a merger, acquisition, financing, or sale of assets, your information
                  may be transferred as part of that transaction.
                </p>
              </div>
            </section>

            {/* Section 6 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                6. International Data Transfers
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  We may process and store your information on servers located in countries other than your own. These
                  countries may have different data protection laws.
                </p>
                <p>
                  Where required by law (for example, for EEA/UK residents), we implement appropriate safeguards for
                  international transfers, such as Standard Contractual Clauses approved by the European Commission or
                  UK authorities or other legally recognised mechanisms.
                </p>
                <p>
                  If you are in Australia, your personal information may be transferred overseas in accordance with the
                  Privacy Act 1988 (Cth) and the Australian Privacy Principles.
                </p>
                <p className="text-sm italic">
                  You can contact us at privacy@nuvitaelabs.com for more details about cross-border transfers and safeguards.
                </p>
              </div>
            </section>

            {/* Section 7 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                7. Data Retention
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>We retain your personal information for as long as necessary to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide and maintain the Service</li>
                  <li>Comply with legal, regulatory, and accounting obligations</li>
                  <li>Resolve disputes and enforce agreements</li>
                </ul>
                <p>In general:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your account and health data are retained while your account is active.</li>
                  <li>
                    If you delete your account, we will delete or anonymise personal data within a reasonable time,
                    except where retention is required by law.
                  </li>
                </ul>
                <p className="text-sm italic">
                  We may use aggregated or de-identified information indefinitely for analytics and research.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                8. Your Rights &amp; Choices
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>Your rights may vary depending on where you live, but may include:</p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  8.1 Access, Correction, Deletion
                </h3>
                <p>You may have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access the personal information we hold about you</li>
                  <li>Correct inaccurate or incomplete information</li>
                  <li>Delete your account and certain personal information</li>
                </ul>
                <p className="text-sm italic">
                  You can usually do this via in-app settings or by contacting us at privacy@nuvitaelabs.com.
                </p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  8.2 AI Consent Controls
                </h3>
                <p>
                  AI features are optional. You can enable or disable AI data processing at any time in Settings {'>'}{' '}
                  Data &amp; Privacy. When disabled, your health data will not be sent to third-party AI services for AI
                  features.
                </p>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  8.3 Additional Rights (EEA/UK, Australia &amp; Other Regions)
                </h3>
                <p>If you are in the EEA, UK, Australia, or similar regimes, you may also:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Request restriction of processing in certain circumstances</li>
                  <li>Object to processing based on legitimate interests or direct marketing</li>
                  <li>Request data portability of specific information you provided to us</li>
                </ul>

                <h3 className={`font-medium mt-6 mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  8.4 Complaints
                </h3>
                <p>
                  If you have concerns about how we handle your data, please contact us first. You may also have the
                  right to lodge a complaint with your local data protection authority.
                </p>
              </div>
            </section>

            {/* Section 9 */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                9. Children’s Privacy
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Flō is not intended for children under 18 years of age. We do not knowingly collect personal
                  information from children. If you believe someone under 18 has provided us information, please contact
                  us at privacy@nuvitaelabs.com.
                </p>
              </div>
            </section>

            {/* Section 10 */}
            <section className="mb-2">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                10. Changes to This Policy
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  We may update this Privacy Policy from time to time. We will update the "Last updated" date above and
                  may notify you within the app or by other means where required by law.
                </p>
                <p>
                  If you have questions, contact us at <span className="font-medium">privacy@nuvitaelabs.com</span>.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
