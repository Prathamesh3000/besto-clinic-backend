import Button from '../common/Button';
import { AnimatedSection } from '../common/Motion';
import { ArrowRight } from 'lucide-react';

export default function CTASection() {
  return (
    <AnimatedSection className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-10 lg:p-16 text-center overflow-hidden">
          {/* Background shapes */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-display text-white mb-4 leading-tight">
              Ready to modernize your practice?
            </h2>
            <p className="text-lg text-primary-100 max-w-2xl mx-auto mb-8 leading-relaxed">
              Join the growing number of dental practices switching to BestoClinic. Start your 14-day free trial — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="white"
                size="lg"
                to="/register"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                to="/contact"
                className="text-white border-white/30 hover:bg-white/10"
              >
                Book a Demo
              </Button>
            </div>
            <p className="text-sm text-primary-200 mt-6">
              No credit card required &middot; 14-day free trial &middot; Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
