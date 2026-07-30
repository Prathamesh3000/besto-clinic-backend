import { useState } from 'react';
import { Calendar, Clock, CheckCircle2 } from 'lucide-react';
import SectionHeading from '../common/SectionHeading';
import { FadeIn } from '../common/Motion';
import Button from '../common/Button';

export default function DemoBooking() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    clinicName: '',
    practitioners: '',
    preferredDate: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section id="demo" className="py-20 bg-neutral-100/50">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 font-display mb-2">Demo Booked!</h3>
          <p className="text-neutral-900/60">
            Thank you! Our team will reach out within 24 hours to confirm your demo session.
          </p>
        </div>
      </section>
    );
  }

  const inputClasses = "input-base";

  return (
    <section id="demo" className="py-20 bg-neutral-100/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Book a Demo"
          title="See BestoClinic in action"
          description="Schedule a personalized walkthrough with our product specialists. We'll show you exactly how BestoClinic can transform your practice."
        />

        <div className="grid lg:grid-cols-5 gap-12 max-w-5xl mx-auto">
          {/* Benefits */}
          <FadeIn className="lg:col-span-2 space-y-6">
            {[
              {
                icon: Calendar,
                title: '30-Minute Walkthrough',
                description: 'See all features tailored to your practice size and needs.',
              },
              {
                icon: Clock,
                title: 'Quick Setup',
                description: 'Learn how most practices go live in under 48 hours.',
              },
              {
                icon: CheckCircle2,
                title: 'No Commitment',
                description: 'Free demo with no obligation. Ask anything.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4">
                  <div className="w-10 h-10 bg-primary-50/60 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-neutral-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-neutral-900/60">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </FadeIn>

          {/* Form */}
          <FadeIn delay={0.15} className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-neutral-300/60 p-6 lg:p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="Dr. Jane Smith"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Work Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="jane@clinic.com"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label htmlFor="clinicName" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Clinic Name</label>
                  <input
                    type="text"
                    id="clinicName"
                    name="clinicName"
                    value={form.clinicName}
                    onChange={handleChange}
                    className={inputClasses}
                    placeholder="Bright Smile Dental"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="practitioners" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Number of Practitioners</label>
                  <select
                    id="practitioners"
                    name="practitioners"
                    value={form.practitioners}
                    onChange={handleChange}
                    className={`${inputClasses} bg-neutral-50`}
                  >
                    <option value="">Select...</option>
                    <option value="1">1 (Solo)</option>
                    <option value="2-5">2 - 5</option>
                    <option value="6-15">6 - 15</option>
                    <option value="16+">16+</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="preferredDate" className="block text-sm font-medium text-neutral-900/70 mb-1.5">Preferred Date</label>
                  <input
                    type="date"
                    id="preferredDate"
                    name="preferredDate"
                    value={form.preferredDate}
                    onChange={handleChange}
                    className={inputClasses}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Book My Free Demo
              </Button>
              <p className="text-xs text-neutral-900/40 text-center">
                By submitting, you agree to our privacy policy. We'll never share your information.
              </p>
            </form>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
