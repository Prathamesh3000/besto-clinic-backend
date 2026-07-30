import SEO from '../components/common/SEO';
import SectionHeading from '../components/common/SectionHeading';
import { FadeIn, FadeInStagger, FadeInStaggerItem } from '../components/common/Motion';
import CTASection from '../components/home/CTASection';
import { Target, Eye, Heart, Users } from 'lucide-react';

const values = [
  {
    icon: Target,
    title: 'Purpose-Built',
    description: 'Every feature is designed with dental workflows in mind, not retrofitted from generic software.',
  },
  {
    icon: Eye,
    title: 'Transparency',
    description: 'Honest pricing, open communication, and no hidden fees. What you see is what you get.',
  },
  {
    icon: Heart,
    title: 'Patient First',
    description: 'We build tools that help you deliver better patient experiences and outcomes.',
  },
  {
    icon: Users,
    title: 'Community',
    description: 'We grow with our customers, taking feedback seriously and shipping what matters.',
  },
];

const team = [
  { name: 'Alex Rivera', role: 'CEO & Co-Founder', bg: 'bg-primary-100 text-primary-700' },
  { name: 'Dr. Priya Patel', role: 'Chief Product Officer', bg: 'bg-accent-100 text-accent-700' },
  { name: 'Marcus Chen', role: 'CTO', bg: 'bg-blue-100 text-blue-700' },
  { name: 'Sarah Larsen', role: 'Head of Customer Success', bg: 'bg-purple-100 text-purple-700' },
];

export default function About() {
  return (
    <>
      <SEO
        title="About Us"
        description="Learn about BestoClinic's mission to modernize dental practice management with cloud-based technology."
        keywords="about BestoClinic, dental software company, dental technology"
      />

      {/* Hero */}
      <section className="pt-28 lg:pt-36 pb-16 bg-gradient-to-b from-primary-50/50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="About Us"
            title="Modernizing dental practice management"
            description="We're a team of dental professionals, engineers, and designers on a mission to make practice management effortless."
          />
        </div>
      </section>

      {/* Story */}
      <section className="py-16">
        <FadeIn className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-2xl font-bold text-neutral-900 mb-6">Our Story</h3>
          <div className="prose prose-gray max-w-none text-neutral-900/60 leading-relaxed space-y-4">
            <p>
              BestoClinic was born from frustration. Our co-founder, a practicing dentist, spent years
              wrestling with outdated software that wasn't designed for modern dental workflows. Clunky
              interfaces, siloed data, and zero multi-location support meant more time on admin and less
              time with patients.
            </p>
            <p>
              In 2023, we set out to build the dental practice management platform we wished existed —
              cloud-native, beautifully designed, and powerful enough for enterprise dental groups while
              remaining simple enough for solo practitioners.
            </p>
            <p>
              Today, BestoClinic serves over 2,500 dental practices worldwide, processing millions of
              appointments and helping dentists focus on what they do best: caring for patients.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Values */}
      <section className="py-16 bg-neutral-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Our Values"
            title="What drives us every day"
          />
          <FadeInStagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <FadeInStaggerItem key={value.title} className="text-center">
                  <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-primary-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-neutral-900 mb-2">{value.title}</h4>
                  <p className="text-sm text-neutral-900/60 leading-relaxed">{value.description}</p>
                </FadeInStaggerItem>
              );
            })}
          </FadeInStagger>
        </div>
      </section>

      {/* Team */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Leadership"
            title="Meet the team"
            description="The people behind BestoClinic."
          />
          <FadeInStagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {team.map((member) => (
              <FadeInStaggerItem key={member.name} className="text-center">
                <div className={`w-20 h-20 rounded-full ${member.bg} flex items-center justify-center mx-auto mb-4 text-xl font-bold`}>
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <h4 className="font-semibold text-neutral-900">{member.name}</h4>
                <p className="text-sm text-neutral-900/50">{member.role}</p>
              </FadeInStaggerItem>
            ))}
          </FadeInStagger>
        </div>
      </section>

      <CTASection />
    </>
  );
}
