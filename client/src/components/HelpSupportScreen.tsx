import { useState } from 'react';
import { X, Bug, MessageCircle, Send, CheckCircle, AlertCircle, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface HelpSupportScreenProps {
  isDark: boolean;
  onClose: () => void;
}

type FormType = 'bug' | 'contact';
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export function HelpSupportScreen({ isDark, onClose }: HelpSupportScreenProps) {
  const [activeForm, setActiveForm] = useState<FormType>('bug');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();
  
  // Bug Report Form State
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugSeverity, setBugSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  
  // Contact Form State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setErrorMessage('');
    
    try {
      const response = await fetch('/api/support/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: bugTitle,
          description: bugDescription,
          severity: bugSeverity
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit bug report');
      }
      
      setSubmitStatus('success');
      toast({
        title: "Bug Report Sent",
        description: "Thank you for helping us improve Flō!",
      });
      
      setTimeout(() => {
        setBugTitle('');
        setBugDescription('');
        setBugSeverity('medium');
        setSubmitStatus('idle');
      }, 2000);
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage('Failed to submit bug report. Please try again.');
      toast({
        title: "Submission Failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setErrorMessage('');
    
    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          message: contactMessage
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      setSubmitStatus('success');
      toast({
        title: "Message Sent",
        description: "We'll get back to you soon!",
      });
      
      setTimeout(() => {
        setContactName('');
        setContactEmail('');
        setContactSubject('');
        setContactMessage('');
        setSubmitStatus('idle');
      }, 2000);
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage('Failed to send message. Please try again.');
      toast({
        title: "Submission Failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`fixed inset-0 z-[60] min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'}`}>
      {/* Header with iOS safe area */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'}`}>
        <div className="px-4 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className={`p-2 -ml-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            data-testid="button-help-close"
          >
            <ChevronLeft className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-slate-600'}`} />
          </button>
          <h1 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Help & Support
          </h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto overflow-y-auto pb-20" style={{ maxHeight: 'calc(100vh - 80px)' }}>
        {/* Form Type Selector */}
        <div className={`rounded-2xl p-1 mb-6 ${isDark ? 'bg-white/5' : 'bg-white/80'}`}
          style={{
            boxShadow: isDark 
              ? '0 10px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              : '0 10px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
          }}
        >
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setActiveForm('bug')}
              className={`py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                activeForm === 'bug'
                  ? isDark
                    ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-300'
                    : 'bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-700'
                  : isDark
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-slate-500 hover:text-slate-700'
              }`}
              data-testid="tab-bug-report"
            >
              <Bug className="w-4 h-4" />
              <span>Report Bug</span>
            </button>
            <button
              onClick={() => setActiveForm('contact')}
              className={`py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                activeForm === 'contact'
                  ? isDark
                    ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-300'
                    : 'bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-700'
                  : isDark
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-slate-500 hover:text-slate-700'
              }`}
              data-testid="tab-contact-us"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Contact Us</span>
            </button>
          </div>
        </div>

        {/* Forms */}
        <AnimatePresence mode="wait">
          {activeForm === 'bug' && (
            <motion.div
              key="bug"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <BugReportForm
                isDark={isDark}
                title={bugTitle}
                setTitle={setBugTitle}
                description={bugDescription}
                setDescription={setBugDescription}
                severity={bugSeverity}
                setSeverity={setBugSeverity}
                onSubmit={handleBugSubmit}
                submitStatus={submitStatus}
              />
            </motion.div>
          )}

          {activeForm === 'contact' && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <ContactForm
                isDark={isDark}
                name={contactName}
                setName={setContactName}
                email={contactEmail}
                setEmail={setContactEmail}
                subject={contactSubject}
                setSubject={setContactSubject}
                message={contactMessage}
                setMessage={setContactMessage}
                onSubmit={handleContactSubmit}
                submitStatus={submitStatus}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success/Error Messages */}
        <AnimatePresence>
          {submitStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mt-4 p-4 rounded-2xl flex items-center gap-3 ${
                isDark 
                  ? 'bg-green-500/20 border border-green-500/30' 
                  : 'bg-green-50 border border-green-200'
              }`}
            >
              <CheckCircle className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <div>
                <p className={`font-medium ${isDark ? 'text-green-300' : 'text-green-900'}`}>
                  {activeForm === 'bug' ? 'Bug report submitted!' : 'Message sent!'}
                </p>
                <p className={`text-sm ${isDark ? 'text-green-400/70' : 'text-green-700'}`}>
                  We'll get back to you as soon as possible.
                </p>
              </div>
            </motion.div>
          )}

          {submitStatus === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mt-4 p-4 rounded-2xl flex items-center gap-3 ${
                isDark 
                  ? 'bg-red-500/20 border border-red-500/30' 
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <AlertCircle className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              <div>
                <p className={`font-medium ${isDark ? 'text-red-300' : 'text-red-900'}`}>
                  Submission failed
                </p>
                <p className={`text-sm ${isDark ? 'text-red-400/70' : 'text-red-700'}`}>
                  {errorMessage}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Bug Report Form Component
interface BugReportFormProps {
  isDark: boolean;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  severity: 'low' | 'medium' | 'high';
  setSeverity: (value: 'low' | 'medium' | 'high') => void;
  onSubmit: (e: React.FormEvent) => void;
  submitStatus: SubmitStatus;
}

function BugReportForm({
  isDark,
  title,
  setTitle,
  description,
  setDescription,
  severity,
  setSeverity,
  onSubmit,
  submitStatus
}: BugReportFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={`rounded-2xl p-6 ${isDark ? 'bg-white/5' : 'bg-white/80'}`}
        style={{
          boxShadow: isDark 
            ? '0 10px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 10px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isDark 
              ? 'bg-gradient-to-br from-red-500/20 to-orange-500/20' 
              : 'bg-gradient-to-br from-red-100 to-orange-100'
          }`}>
            <Bug className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
          </div>
          <div>
            <h2 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Report a Bug
            </h2>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
              Help us improve Flō
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Bug Title */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Bug Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              required
              className={`w-full px-4 py-3 rounded-xl transition-all ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="input-bug-title"
            />
          </div>

          {/* Severity */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Severity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSeverity(level)}
                  className={`py-2 px-4 rounded-lg transition-all capitalize ${
                    severity === level
                      ? level === 'high'
                        ? isDark
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                          : 'bg-red-100 text-red-700 border border-red-300'
                        : level === 'medium'
                          ? isDark
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                            : 'bg-orange-100 text-orange-700 border border-orange-300'
                          : isDark
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                            : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                      : isDark
                        ? 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                  }`}
                  data-testid={`button-severity-${level}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Bug Description */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe what happened, what you expected, and steps to reproduce..."
              required
              rows={6}
              className={`w-full px-4 py-3 rounded-xl transition-all resize-none ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="textarea-bug-description"
            />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitStatus === 'submitting' || !title || !description}
        className={`w-full py-4 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all ${
          submitStatus === 'submitting' || !title || !description
            ? isDark
              ? 'bg-white/5 text-white/30'
              : 'bg-slate-200 text-slate-400'
            : isDark
              ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
              : 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
        }`}
        style={{
          boxShadow: submitStatus !== 'submitting' && title && description
            ? '0 10px 30px rgba(6, 182, 212, 0.3)'
            : 'none'
        }}
        data-testid="button-submit-bug"
      >
        {submitStatus === 'submitting' ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Submitting...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Submit Bug Report</span>
          </>
        )}
      </button>
    </form>
  );
}

// Contact Form Component
interface ContactFormProps {
  isDark: boolean;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitStatus: SubmitStatus;
}

function ContactForm({
  isDark,
  name,
  setName,
  email,
  setEmail,
  subject,
  setSubject,
  message,
  setMessage,
  onSubmit,
  submitStatus
}: ContactFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={`rounded-2xl p-6 ${isDark ? 'bg-white/5' : 'bg-white/80'}`}
        style={{
          boxShadow: isDark 
            ? '0 10px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 10px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isDark 
              ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20' 
              : 'bg-gradient-to-br from-cyan-100 to-blue-100'
          }`}>
            <MessageCircle className={`w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div>
            <h2 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Contact Us
            </h2>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
              We're here to help
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className={`w-full px-4 py-3 rounded-xl transition-all ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="input-contact-name"
            />
          </div>

          {/* Email */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              className={`w-full px-4 py-3 rounded-xl transition-all ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="input-contact-email"
            />
          </div>

          {/* Subject */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Subject *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              required
              className={`w-full px-4 py-3 rounded-xl transition-all ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="input-contact-subject"
            />
          </div>

          {/* Message */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
              Message *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us how we can help..."
              required
              rows={6}
              className={`w-full px-4 py-3 rounded-xl transition-all resize-none ${
                isDark
                  ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:bg-white/10 focus:border-cyan-500/50'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              } outline-none`}
              data-testid="textarea-contact-message"
            />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitStatus === 'submitting' || !name || !email || !subject || !message}
        className={`w-full py-4 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all ${
          submitStatus === 'submitting' || !name || !email || !subject || !message
            ? isDark
              ? 'bg-white/5 text-white/30'
              : 'bg-slate-200 text-slate-400'
            : isDark
              ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
              : 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
        }`}
        style={{
          boxShadow: submitStatus !== 'submitting' && name && email && subject && message
            ? '0 10px 30px rgba(6, 182, 212, 0.3)'
            : 'none'
        }}
        data-testid="button-submit-contact"
      >
        {submitStatus === 'submitting' ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Sending...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Send Message</span>
          </>
        )}
      </button>
    </form>
  );
}
