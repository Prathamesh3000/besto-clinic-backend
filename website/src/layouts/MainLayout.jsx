import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import { PageTransition } from '../components/common/Motion';
import { useScrollToTop } from '../hooks/useScrollToTop';
import ChatbotController from '../components/chatbot-v2/ChatbotController';
import ErrorBoundary from '../components/common/ErrorBoundary';

export default function MainLayout() {
  useScrollToTop();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </PageTransition>
        </AnimatePresence>
      </main>

      <Footer />

      {/* NEW: Professional Chatbot (replaces old scanner) */}
      <ChatbotController />
    </div>
  );
}
