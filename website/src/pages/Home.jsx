import { useState } from 'react';
import SEO from '../components/common/SEO';
import Hero from '../components/home/Hero';
import Testimonials from '../components/home/Testimonials';

// Patient sections
import HowItWorks from '../components/home/HowItWorks';
import DoctorDiscovery from '../components/home/DoctorDiscovery';
import AppDownload from '../components/home/AppDownload';
import AIDentalScan from '../components/home/AIDentalScan';

// Shared sections
import SmartReminders from '../components/home/SmartReminders';

// Clinic sections
import ValueProposition from '../components/home/ValueProposition';
import FeatureHighlights from '../components/home/FeatureHighlights';
import WhyChooseUs from '../components/home/WhyChooseUs';
import SecurityCompliance from '../components/home/SecurityCompliance';
import DemoBooking from '../components/home/DemoBooking';
import CTASection from '../components/home/CTASection';

export default function Home() {
  const [audience, setAudience] = useState('patients');

  const seo =
    audience === 'clinics'
      ? {
          title: 'Modern Dental Practice Management Software',
          description: 'Cloud-based dental practice management software. Streamline scheduling, billing, patient records, and multi-branch operations.',
          keywords: 'dental software, practice management, clinic management, dental SaaS, appointment scheduling',
        }
      : {
          title: 'Find & Book the Best Dental Care Near You',
          description: 'Search top-rated dentists, check availability, and book appointments instantly. Your dental health, simplified.',
          keywords: 'find dentist, book dental appointment, dental clinic near me, best dentist, dental care',
        };

  return (
    <>
      <SEO title={seo.title} description={seo.description} keywords={seo.keywords} />

      <Hero audience={audience} setAudience={setAudience} />

      {audience === 'patients' ? (
        <>
          <HowItWorks />
          <AIDentalScan />
          <SmartReminders audience="patients" />
          <DoctorDiscovery />
          <AppDownload />
        </>
      ) : (
        <>
          <ValueProposition />
          <FeatureHighlights />
          <SmartReminders audience="clinics" />
          <WhyChooseUs />
          <SecurityCompliance />
          <DemoBooking />
          <CTASection />
        </>
      )}

      <Testimonials audience={audience} />
    </>
  );
}
