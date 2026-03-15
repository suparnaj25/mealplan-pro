import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChefHat, Send, Bot } from 'lucide-react';
import { api } from '../services/api';

export default function AiChef() {
  const [aiConfigured, setAiConfigured] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { api.getAiStatus().then(d => setAiConfigured(d.configured)).catch(() => setAiConfigured(false)); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const data = await api.aiChat(msg, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` }]);
    } finally { setChatLoading(false); }
  };

  if (aiConfigured === null) return <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!aiConfigured) return <div className="text-center py-16"><div className="text-6xl mb-4">👨‍🍳</div><h3 className="text-xl font-bold mb-2">AI Chef Not Available</h3><p className="text-gray-500">Set OPENAI_API_KEY to enable.</p></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="section-title flex items-center gap-2"><ChefHat className="text-brand-500" size={28} /> AI Chef</h1>
        <p className="text-sm text-gray-500 mt-1">Ask me anything about meals, nutrition, or recipes</p>
      </div>
      <div className="glass-card overflow-hidden flex flex-col" style={{ height: '75vh' }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Bot size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-sm">What would you like to know?</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Suggest a quick vegan dinner', 'High protein meal ideas', 'What pairs well with quinoa?', 'Help me use up leftover rice'].map(q => (
                  <button key={q} onClick={() => setChatInput(q)} className="text-xs bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full hover:bg-brand-500/10 hover:text-brand-500 transition-colors">{q}</button>
                ))}
              </div>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-brand-500 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-800 rounded-bl-md'}`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </motion.div>
          ))}
          {chatLoading && <div className="flex justify-start"><div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 rounded-bl-md"><div className="flex gap-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask the AI Chef..." className="input-field flex-1 text-sm" disabled={chatLoading} />
            <button type="submit" disabled={chatLoading || !chatInput.trim()} className="btn-primary p-3 rounded-xl"><Send size={18} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}