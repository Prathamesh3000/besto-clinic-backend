import { Shield, Lock, FileCheck, Server, Eye, Key } from 'lucide-react';
import { FadeIn, FadeInStagger, FadeInStaggerItem, HoverCard } from '../common/Motion';

const securityFeatures = [
  { icon: Lock, title: 'End-to-End Encryption', description: 'AES-256 encryption for all data at rest and in transit.' },
  { icon: Shield, title: 'HIPAA Compliant', description: 'Full compliance with healthcare data protection regulations.' },
  { icon: FileCheck, title: 'SOC 2 Certified', description: 'Independently audited security controls and practices.' },
  { icon: Server, title: 'Tenant Isolation', description: 'Dedicated database per clinic with zero data cross-contamination.' },
  { icon: Eye, title: 'Audit Logs', description: 'Complete activity trail for every action in your system.' },
  { icon: Key, title: '2FA Authentication', description: 'Two-factor authentication for all user accounts.' },
];

export default function SecurityCompliance() {
  return (
    <section className="py-20 bg-gradient-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-white/10 text-primary-200 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-white/10">
            Security & Compliance
          </span>
          <h2 className="text-3xl md:text-4xl font-bold font-display mb-4 leading-tight">
            Enterprise-grade security your patients deserve
          </h2>
          <p className="text-lg text-primary-200 leading-relaxed">
            Built from the ground up with a security-first architecture. Every piece of patient data is encrypted, audited, and compliant.
          </p>
        </FadeIn>

        <FadeInStagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {securityFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <FadeInStaggerItem key={feature.title}>
                <HoverCard className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-primary-400/30 transition-colors duration-300">
                  <Icon className="w-8 h-8 text-primary-300 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-primary-300 text-sm leading-relaxed">{feature.description}</p>
                </HoverCard>
              </FadeInStaggerItem>
            );
          })}
        </FadeInStagger>
      </div>
    </section>
  );
}
