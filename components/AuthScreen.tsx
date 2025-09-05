import React, { useState } from 'react';
import AuthForm from './AuthForm';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string) => Promise<void>;
  isHiding: boolean;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onSignup, isHiding }) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="relative min-h-screen text-white flex flex-col items-center justify-center p-4 overflow-hidden" style={{
      backgroundImage: `
        linear-gradient(rgba(10, 10, 26, 0.8), rgba(10, 10, 26, 0.8)),
        repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 242, 255, 0.1) 1px, rgba(0, 242, 255, 0.1) 2px),
        repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0, 242, 255, 0.1) 1px, rgba(0, 242, 255, 0.1) 2px)
      `,
      backgroundSize: '100% 100%, 50px 50px, 50px 50px',
      animation: 'grid-pan 60s linear infinite'
    }}>
      <div className={`relative z-10 w-full max-w-md ${isHiding ? 'animate-fade-out-up' : 'animate-fade-in'}`}>
        <AuthForm
          onSubmit={authMode === 'login' ? onLogin : onSignup}
          type={authMode}
        />
        <div className="flex justify-center gap-4 mt-6">
          <button
            className={`py-2 px-6 rounded-md font-bold transition-all duration-300 border-2 ${authMode === 'login' ? 'bg-cyber-primary text-cyber-bg scale-110 shadow-lg shadow-cyber-primary/40 border-cyber-primary' : 'bg-transparent text-cyber-primary border-cyber-primary/50'}`}
            onClick={() => setAuthMode('login')}
          >
            LOGIN
          </button>
          <button
            className={`py-2 px-6 rounded-md font-bold transition-all duration-300 border-2 ${authMode === 'signup' ? 'bg-cyber-primary text-cyber-bg scale-110 shadow-lg shadow-cyber-primary/40 border-cyber-primary' : 'bg-transparent text-cyber-primary border-cyber-primary/50'}`}
            onClick={() => setAuthMode('signup')}
          >
            SIGN UP
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
