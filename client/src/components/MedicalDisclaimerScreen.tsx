import { AlertTriangle, ChevronLeft } from 'lucide-react';

interface MedicalDisclaimerScreenProps {
  isDark: boolean;
  onClose: () => void;
}

export function MedicalDisclaimerScreen({ isDark, onClose }: MedicalDisclaimerScreenProps) {
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
              data-testid="button-disclaimer-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Medical Disclaimer</h1>
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
            {/* Introduction */}
            <div className={`mb-8 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
              <p className="mb-4">
                Flo is a health information and wellness support application created by Nuvitae Labs. It is not a substitute for professional medical advice, diagnosis, or treatment.
              </p>
            </div>

            {/* Important Notice */}
            <div className={`p-6 rounded-xl mb-8 ${
              isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-300'
            }`}>
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                <div>
                  <p className={`font-medium text-lg mb-2 ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                    Important Notice
                  </p>
                  <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    This application is designed to support your health journey, not replace professional medical care. Always consult qualified healthcare professionals for medical decisions.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 1: No Medical Advice */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                No Medical Advice
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Any information, content, insights, scores, or recommendations provided by the app (including AI-generated content) are for general informational and educational purposes only.
                </p>
                <p className="font-medium">
                  Nothing in the app is intended to be, or should be taken as, medical advice for any individual case or situation.
                </p>
              </div>
            </section>

            {/* Section 2: No Doctor-Patient Relationship */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                No Doctor-Patient Relationship
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Use of the app does not create a doctor-patient relationship between you and Nuvitae Labs, or between you and any health professional referenced in the app.
                </p>
                <p>
                  The app does not provide clinical care, diagnosis, or treatment.
                </p>
              </div>
            </section>

            {/* Section 3: Always Consult a Health Professional */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Always Consult a Health Professional
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Always seek the advice of your doctor, physician, or other qualified health provider with any questions you have about your health, medical condition, medications, or treatment.
                </p>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <p className="font-medium">
                    Never ignore, delay, or discontinue professional medical advice because of something you have read in the app or received from the app's AI features.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: Emergency Situations */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Emergency Situations
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <div className={`p-6 rounded-xl ${
                  isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                    <div>
                      <p className={`font-medium mb-2 ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                        The app must not be used for medical emergencies.
                      </p>
                      <p className="text-sm">
                        If you think you may be experiencing a medical emergency, call your local emergency number immediately (for example, 000 in Australia, 911 in the USA, 112 in the EU) or seek urgent care.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 5: Data, Accuracy, and Limitations */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Data, Accuracy, and Limitations
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  Insights and recommendations may be based on the information you provide, data from connected devices, and third-party sources. These may be incomplete, inaccurate, or out of date.
                </p>
                <p>
                  The app may use algorithms and AI models that have inherent limitations and may not reflect your full medical history, current medications, allergies, or other risk factors.
                </p>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <p className="font-medium text-sm">
                    Nuvitae Labs makes no guarantee that any information in the app is accurate, complete, or suitable for your specific circumstances.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6: No Changes to Medication or Treatment Without Approval */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                No Changes to Medication or Treatment Without Approval
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <p className="font-medium mb-2">
                    Do not start, stop, or change any medication, supplement, or treatment based solely on information from the app.
                  </p>
                  <p className="text-sm">
                    Any lifestyle, diet, exercise, or supplementation changes should be discussed and confirmed with your healthcare provider - especially if you have existing medical conditions or take prescription medication.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 7: Third-Party Services and Devices */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Third-Party Services and Devices
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  The app may integrate with third-party services (such as labs, wearables, or health platforms). Nuvitae Labs is not responsible for the accuracy, availability, or performance of any third-party data or services.
                </p>
                <p>
                  Interpretation of lab results or diagnostic reports in the app is informational only and must be confirmed with a qualified health professional.
                </p>
              </div>
            </section>

            {/* Section 8: Limitation of Liability */}
            <section className="mb-8">
              <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Limitation of Liability
              </h2>
              <div className={`space-y-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                <p>
                  To the maximum extent permitted by applicable law, Nuvitae Labs and its officers, employees, contractors, and partners are not liable for any loss, injury, claim, or damage arising from:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your reliance on information provided by the app,</li>
                  <li>Your use or misuse of the app,</li>
                  <li>Any decisions you make about your health, lifestyle, or treatment based on the app's content.</li>
                </ul>
              </div>
            </section>

            {/* Acknowledgement */}
            <div className={`p-6 rounded-xl ${
              isDark 
                ? 'bg-gradient-to-br from-teal-500/10 to-blue-500/10 border border-teal-500/20' 
                : 'bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-200'
            }`}>
              <p className={`font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Acknowledgement and Agreement
              </p>
              <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                By using Flo, you acknowledge and agree that you are solely responsible for how you use the information provided and for seeking appropriate medical advice from qualified professionals.
              </p>
            </div>

            {/* Contact */}
            <div className={`mt-8 pt-6 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                If you have questions about this Medical Disclaimer, please contact:
              </p>
              <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                <p className="font-medium">Nuvitae Labs Pty Ltd</p>
                <p className="text-sm mt-1">
                  Email: <a href="mailto:privacy@nuvitaelabs.com" className={`underline ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>privacy@nuvitaelabs.com</a>
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className={`text-center text-sm pt-8 border-t mt-8 ${
              isDark ? 'border-white/10 text-white/40' : 'border-gray-200 text-gray-400'
            }`}>
              <p>2025 Nuvitae Labs Pty Ltd. All rights reserved.</p>
              <p className="mt-2">Flo - Health tracking for longevity</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
