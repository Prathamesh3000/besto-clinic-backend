import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, MessageSquare, CheckCircle2, ArrowRight } from 'lucide-react';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import { EASE, VP } from '../components/common/designSystem';

const CONTACT_INFO = [
  { icon: Mail, label: 'Email Us', value: 'hello@bestoclinic.com', href: 'mailto:hello@bestoclinic.com', description: 'Our team typically responds within 2 hours' },
  { icon: Phone, label: 'Call Us', value: '1-800-123-4567', href: 'tel:+18001234567', description: 'Mon–Fri, 9 AM – 6 PM IST' },
  { icon: MapPin, label: 'Visit Us', value: 'San Francisco, CA 94105', description: 'Schedule a meeting first' },
  { icon: MessageSquare, label: 'Live Chat', value: 'Available during business hours', description: 'Average response time: 5 minutes' },
];

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      <SEO
        title="Contact Us"
        description="Get in touch with the BestoClinic team. We'd love to hear from you."
        keywords="contact BestoClinic, dental software support, demo request"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-20 lg:pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="inline-block px-4 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-full mb-6 tracking-wide uppercase border border-white/20">
              Contact
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
              Let's talk
            </h1>
            <p className="text-lg text-primary-100/80 leading-relaxed max-w-2xl mx-auto">
              Have questions about BestoClinic? We'd love to hear from you. Our team typically responds within 2 hours.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Split Layout */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, ease: EASE }}
            >
              {submitted ? (
                <div className="bg-white rounded-3xl border border-neutral-200 p-12 text-center">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold font-display text-neutral-900 mb-2">Message Sent!</h3>
                  <p className="text-neutral-600">We'll get back to you within 2 hours during business hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-neutral-200 p-8 lg:p-10 space-y-5">
                  <h2 className="text-2xl font-bold font-display text-neutral-900 mb-2">Send us a message</h2>
                  <p className="text-sm text-neutral-500 mb-6">Fill out the form and we'll respond within 2 hours.</p>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={form.name}
                        onChange={handleChange}
                        className="input-base"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={form.email}
                        onChange={handleChange}
                        className="input-base"
                        placeholder="you@clinic.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-neutral-700 mb-1.5">Subject</label>
                    <select
                      id="subject"
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      className="input-base bg-white"
                    >
                      <option value="">Select a topic...</option>
                      <option value="pricing">Pricing Question</option>
                      <option value="support">Technical Support</option>
                      <option value="partnership">Partnership Inquiry</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-neutral-700 mb-1.5">Message</label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={5}
                      value={form.message}
                      onChange={handleChange}
                      className="input-base resize-none"
                      placeholder="Tell us how we can help..."
                    />
                  </div>
                  <Btn type="submit" className="w-full">
                    Send Message <ArrowRight className="w-4 h-4 ml-2" />
                  </Btn>
                </form>
              )}
            </motion.div>

            {/* Contact Info Cards */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
              className="space-y-6"
            >
              {CONTACT_INFO.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="bg-white rounded-2xl border border-neutral-200 p-6 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold font-display text-neutral-900 mb-1">{item.label}</h3>
                        {item.href ? (
                          <a href={item.href} className="text-primary-600 hover:text-primary-700 font-medium text-sm">
                            {item.value}
                          </a>
                        ) : (
                          <p className="text-sm text-neutral-700 font-medium">{item.value}</p>
                        )}
                        <p className="text-xs text-neutral-400 mt-1">{item.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
