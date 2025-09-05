import React from 'react';
import ChallengeSelector from './ChallengeSelector';
import { User, Challenge, ChallengeStatus } from '../types';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
  onSaveProgress: () => void;
  onLoadProgressClick: () => void;
  challenges: Challenge[];
  statuses: ChallengeStatus[];
  currentChallengeId: number;
  onSelectChallenge: (index: number) => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ 
    isOpen, 
    onClose, 
    user, 
    onLogout, 
    onSaveProgress,
    onLoadProgressClick,
    challenges, 
    statuses, 
    currentChallengeId, 
    onSelectChallenge 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-cyber-bg/90 backdrop-blur-sm z-50 animate-fade-in md:hidden" onClick={onClose}>
            <div className="absolute top-0 left-0 h-full w-4/5 max-w-sm bg-cyber-surface p-4 shadow-2xl shadow-cyber-secondary/30 border-r-2 border-cyber-secondary/50 flex flex-col space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center pb-2 border-b border-cyber-primary/30">
                    <h2 className="text-2xl font-display font-bold text-cyber-primary tracking-widest">MENU</h2>
                    <button onClick={onClose} className="text-cyber-dim hover:text-cyber-primary transition-colors" aria-label="Close menu">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto">
                    <ChallengeSelector
                        challenges={challenges}
                        statuses={statuses}
                        currentChallengeId={currentChallengeId}
                        onSelectChallenge={(index) => {
                            onSelectChallenge(index);
                            onClose();
                        }}
                    />
                </div>

                <div className="border-t border-cyber-primary/30 pt-4 space-y-2">
                    <div className="px-4 py-2 text-center text-cyber-dim truncate">{user.email}</div>
                    <button
                        className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-cyber-secondary hover:text-cyber-bg transition-colors rounded-md"
                        onClick={() => { onSaveProgress(); onClose(); }}
                    >
                        Save Progress
                    </button>
                    <button
                        className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-cyber-secondary hover:text-cyber-bg transition-colors rounded-md"
                        onClick={() => { onLoadProgressClick(); onClose(); }}
                    >
                        Load Progress
                    </button>
                    <button
                        className="w-full text-left px-4 py-3 text-sm text-cyber-text hover:bg-red-500 hover:text-white transition-colors rounded-md"
                        onClick={() => { onLogout(); onClose(); }}
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;