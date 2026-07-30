/**
 * ChatbotWidget - Floating Button Trigger
 * Professional pill button with notification badge
 * Bottom-right corner, fixed position
 */

import React from 'react';
import '../../styles/chatbotDesignSystem.css';

export default function ChatbotWidget({ onClick, unreadCount = 0 }) {
  return (
    <div className="chatbot-widget">
      <button
        className="chatbot-widget-button"
        onClick={onClick}
        aria-label="Open BestoClinic AI Assistant"
      >
        {/* Chatbot Icon Image */}
        <img
          src="/chatbot/dental-chat-bot-icon.svg"
          alt="AI Assistant"
          className="chatbot-widget-icon"
          style={{ width: '40px', height: '40px' }}
        />

        {/* Notification badge (only shown if unreadCount > 0) */}
        {unreadCount > 0 && (
          <span className="chatbot-widget-badge" aria-label={`${unreadCount} unread messages`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
