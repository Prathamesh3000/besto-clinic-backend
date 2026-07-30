import { Link } from 'react-router-dom';
import { Mail, Phone, Facebook, Twitter, Linkedin, Instagram, Shield, Lock, Server } from 'lucide-react';

const footerLinks = {
  Product: [
    { name: 'Features', path: '/features' },
    { name: 'Pricing', path: '/pricing' },
    { name: 'Browse Doctors', path: '/browse?tab=doctors' },
    { name: 'Browse Clinics', path: '/browse?tab=clinics' },
    { name: 'Telemedicine', path: '/features#telemedicine' },
  ],
  Company: [
    { name: 'About Us', path: '/about' },
    { name: 'Blog', path: '/blog' },
    { name: 'Careers', path: '/careers' },
    { name: 'Contact', path: '/contact' },
  ],
  Resources: [
    { name: 'Register Your Clinic', path: '/register' },
    { name: 'Patient Portal', path: '/patient/login' },
    { name: 'Security', path: '/features#privacy' },
    { name: 'API Documentation', path: '#' },
  ],
  Legal: [
    { name: 'Privacy Policy', path: '#' },
    { name: 'Terms of Service', path: '#' },
    { name: 'Cookie Policy', path: '#' },
  ],
};

const socials = [
  { icon: Facebook, href: '#' },
  { icon: Twitter, href: '#' },
  { icon: Linkedin, href: '#' },
  { icon: Instagram, href: '#' },
];

const complianceBadges = [
  { icon: Shield, label: 'HIPAA Compliant' },
  { icon: Lock, label: 'AES-256 Encryption' },
  { icon: Server, label: 'SOC 2 Type II' },
];

export default function Footer() {
  return (
    <footer className="bg-neutral-950 text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20 pb-10">
        <div className="grid lg:grid-cols-6 gap-12 lg:gap-8 mb-12 lg:mb-16">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-5">
              <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
              <span className="text-xl font-bold font-display tracking-tight text-white">
                Besto<span className="text-secondary-400">Clinic</span>
              </span>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed mb-6 max-w-sm">
              The modern cloud platform for dental clinics and patients. Scheduling, billing, telemedicine, and more — all in one place.
            </p>
            <div className="flex items-center gap-3 mb-6">
              {socials.map(({ icon: Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <a href="mailto:hello@bestoclinic.com" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                <Mail className="w-4 h-4" /> hello@bestoclinic.com
              </a>
              <a href="tel:+18001234567" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                <Phone className="w-4 h-4" /> 1-800-123-4567
              </a>
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider mb-4">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.path}
                      className="text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-neutral-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} BestoClinic. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {complianceBadges.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-neutral-500">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
