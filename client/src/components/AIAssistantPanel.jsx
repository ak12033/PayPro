import React, { useState, useRef, useEffect } from 'react';
import { LuX, LuSend, LuBot, LuUser, LuLoader, LuTrash2 } from 'react-icons/lu';
import { useLocation } from 'react-router-dom';
import api from '../api/api';

const AIAssistantPanel = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi there! I am your PayPro AI Assistant. Ask me anything about your recent transactions, spending habits, or financial queries!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load chat history from backend on open
  useEffect(() => {
    if (isOpen) {
      fetchChatHistory();
    }
  }, [isOpen]);

  const fetchChatHistory = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/ai/history');
      if (response.data?.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
      } else {
        setMessages([
          { sender: 'ai', text: 'Hi there! I am your PayPro AI Assistant. Ask me anything about your recent transactions, spending habits, or financial queries!' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userQuery }]);
    setInput('');
    setIsLoading(true);

    try {
      // Pass both the user query and the current page URL path for page-awareness
      const response = await api.post('/ai/chat', { 
        query: userQuery,
        path: location.pathname 
      });
      
      const aiReply = response.data?.response || "Sorry, I couldn't process that.";
      setMessages(prev => [...prev, { sender: 'ai', text: aiReply }]);
    } catch (error) {
      console.error('AI Assistant Error:', error);
      const errorMsg = error.response?.data?.message || 'Sorry, I encountered an error connecting to my brain. Please try again later.';
      setMessages(prev => [...prev, { sender: 'ai', text: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear your chat history?')) {
      try {
        setIsLoading(true);
        await api.delete('/ai/history');
        setMessages([
          { sender: 'ai', text: 'Hi there! I am your PayPro AI Assistant. Ask me anything about your recent transactions, spending habits, or financial queries!' }
        ]);
      } catch (error) {
        console.error('Failed to clear chat history:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Lightweight custom markdown formatter to support rich text responses in chat
  const renderMessageText = (text) => {
    if (!text) return '';
    const lines = text.split('\n');

    return lines.map((line, index) => {
      let trimmed = line.trim();

      // 1. Bullet Lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const content = trimmed.substring(2);
        return (
          <li key={index} className="ml-5 list-disc mb-1.5 text-slate-300">
            {parseInlineStyles(content)}
          </li>
        );
      }

      // 2. Sub-headings
      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={index} className="text-xs font-bold text-white uppercase tracking-wider mt-3 mb-1.5">
            {parseInlineStyles(trimmed.substring(4))}
          </h4>
        );
      }
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={index} className="text-sm font-bold text-cyan-300 mt-4 mb-2">
            {parseInlineStyles(trimmed.substring(3))}
          </h3>
        );
      }

      // 3. Empty spacing
      if (trimmed === '') {
        return <div key={index} className="h-2" />;
      }

      // 4. Default Paragraphs
      return (
        <p key={index} className="mb-2 last:mb-0">
          {parseInlineStyles(line)}
        </p>
      );
    });
  };

  const parseInlineStyles = (content) => {
    // Match bold string markdown: **text**
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      parts.push(
        <strong key={match.index} className="font-semibold text-cyan-300">
          {match[1]}
        </strong>
      );
      lastIndex = boldRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" 
          onClick={onClose}
        />
      )}

      {/* Slide-over Panel */}
      <div 
        className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0b1423] border-l border-white/10 shadow-2xl z-[101] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <LuBot className="text-white text-xl" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">PayPro AI</h2>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 1 && (
              <button 
                onClick={handleClearHistory}
                title="Clear chat history"
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                disabled={isLoading}
              >
                <LuTrash2 size={18} />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LuX size={20} />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 ${
                  msg.sender === 'user' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-cyan-500/20 text-cyan-300'
                }`}>
                  {msg.sender === 'user' ? <LuUser size={14} /> : <LuBot size={14} />}
                </div>
                
                {/* Message Bubble */}
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-white/[0.05] border border-white/5 text-slate-200 rounded-tl-sm'
                }`}>
                  {msg.sender === 'user' ? msg.text : renderMessageText(msg.text)}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[85%]">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center mt-1">
                  <LuBot size={14} />
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.05] border border-white/5 text-slate-200 rounded-tl-sm flex items-center gap-2">
                  <LuLoader className="animate-spin text-cyan-400" size={16} />
                  <span className="text-xs text-slate-400 animate-pulse">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-5 border-t border-white/10 bg-[#070e1a]">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your finances..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 pl-4 pr-12 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              disabled={isLoading}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2 rounded-xl bg-cyan-500 text-white hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 transition-colors"
            >
              <LuSend size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default AIAssistantPanel;
