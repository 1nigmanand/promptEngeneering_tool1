import React, { useState } from 'react';
import { User, ImageService } from '../types';

interface HeaderProps {
    user: User;
    onLogout: () => void;
    isMuted: boolean;
    onToggleMute: () => void;
    streak: number;
    streakChange: 'increase' | 'decrease' | 'none';
    selectedService: ImageService;
    onServiceChange: (service: ImageService) => void;
    onSaveProgress: () => void;
    onLoadProgressClick: () => void;
    onOpenMenu: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
    user, 
    onLogout, 
    isMuted, 
    onToggleMute, 
    streak, 
    streakChange, 
    selectedService, 
    onServiceChange, 
    onSaveProgress,
    onLoadProgressClick,
    onOpenMenu 
}) => {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const isSoundEffectivelyOff = isMuted;

    return (
        <header className="relative z-10 py-4 px-4 md:px-8 bg-cyber-surface/50 backdrop-blur-sm border-b border-cyber-primary/20 flex justify-between items-center">
            <h1 className="title-scan text-2xl md:text-3xl font-display font-bold text-white tracking-widest">
                <span className="text-cyber-primary">PROMPT</span>//CHALLENGE
            </h1>
            <div className="hidden md:flex items-center gap-6">
                <button onClick={onToggleMute} className="text-cyber-dim hover:text-cyber-primary transition-colors" aria-label={isSoundEffectivelyOff ? 'Unmute' : 'Mute'}>
                    {isSoundEffectivelyOff ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5 5 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                    )}
                </button>
                <div className={`flex items-center gap-2 text-cyber-accent font-bold ${streakChange === 'decrease' ? 'animate-pulse-red text-red-500' : ''}`} title={`${streak} similarity score improvements!`}>
                    <span className="text-2xl drop-shadow-[0_0_5px_#00ff7f]">🔥</span>
                    <span className={`text-lg ${streakChange === 'increase' ? 'animate-streak-pop' : ''}`}>{streak}</span>
                </div>
                <div className="relative">
                    <select
                        id="image-service"
                        value={selectedService}
                        onChange={e => onServiceChange(e.target.value as ImageService)}
                        className="appearance-none py-2 pl-4 pr-10 rounded-md bg-cyber-surface border border-cyber-secondary/50 text-white font-bold transition-colors focus:outline-none focus:border-cyber-secondary cursor-pointer"
                    >
                        <option value="gemini-imagen-3">Google Imagen 3 (Fast) 🎨</option>
                        <option value="pollinations-flux">Pollinations (Flux) 🤖</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-cyber-secondary">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
                <div className="relative inline-block text-left">
                    <button
                        className="text-cyber-dim hover:text-cyber-primary transition-colors"
                        onClick={() => setShowProfileDropdown((prev) => !prev)}
                    >
                        {user.email}
                    </button>
                    {showProfileDropdown && (
                        <div className="absolute right-0 mt-4 w-56 bg-cyber-surface rounded-md shadow-lg z-50 border-2 border-cyber-secondary/50">
                        <div className="p-3 text-center text-cyber-dim border-b border-cyber-secondary/30">{user.email}</div>
                        <button
                            className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-cyber-secondary hover:text-cyber-bg transition-colors"
                            onClick={() => { onSaveProgress(); setShowProfileDropdown(false); }}
                        >
                            Save Progress
                        </button>
                        <button
                            className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-cyber-secondary hover:text-cyber-bg transition-colors"
                            onClick={() => { onLoadProgressClick(); setShowProfileDropdown(false); }}
                        >
                            Load Progress
                        </button>
                        <button
                            className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-red-500 hover:text-white rounded-b-md transition-colors"
                            onClick={() => { onLogout(); setShowProfileDropdown(false); }}
                        >
                            Logout
                        </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="md:hidden">
                <button onClick={onOpenMenu} className="text-cyber-dim hover:text-cyber-primary transition-colors" aria-label="Open menu">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>
        </header>
    );
};

export default Header;