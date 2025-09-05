import React, { useState } from 'react';
import Spinner from './Spinner';

interface AuthFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  type: 'login' | 'signup';
}

const AuthForm: React.FC<AuthFormProps> = ({ onSubmit, type }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(email, password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-cyber-surface/70 backdrop-blur-md rounded-lg shadow-2xl shadow-cyber-primary/20 p-8 w-full max-w-md mx-auto border-2 border-cyber-primary/30"
    >
      <h2 className="text-3xl font-display font-bold text-cyber-primary text-center tracking-widest">
        {type === 'login' ? 'AGENT LOGIN' : 'CREATE ID'}
      </h2>
      <div>
        <label htmlFor="email" className="block text-sm font-bold text-cyber-accent mb-2 uppercase tracking-wider">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          placeholder="agent@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full p-3 bg-cyber-bg rounded-md border-2 border-cyber-secondary/50 focus:border-cyber-secondary focus:ring-2 focus:ring-cyber-secondary/50 focus:outline-none transition-all text-cyber-text placeholder:text-cyber-dim"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-bold text-cyber-accent mb-2 uppercase tracking-wider">
          Password
        </label>
        <input
          id="password"
          type="password"
          placeholder="Enter secure password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full p-3 bg-cyber-bg rounded-md border-2 border-cyber-secondary/50 focus:border-cyber-secondary focus:ring-2 focus:ring-cyber-secondary/50 focus:outline-none transition-all text-cyber-text placeholder:text-cyber-dim"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center items-center py-3 px-6 bg-cyber-primary text-cyber-bg font-bold rounded-md transition-all duration-300 disabled:bg-cyber-dim disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyber-primary/50 glitch-button"
        data-text={loading ? '' : (type === 'login' ? 'ACCESS' : 'REGISTER')}
      >
        {loading
          ? <Spinner />
          : type === 'login'
            ? 'ACCESS'
            : 'REGISTER'}
      </button>
      {error && <div className="text-yellow-400 bg-red-500/30 p-3 rounded-md text-center mt-2 border border-red-500">{error}</div>}
    </form>
  );
};

export default AuthForm;