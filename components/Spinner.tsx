
import React from 'react';

const Spinner: React.FC = () => {
  return (
    <div className="w-12 h-12 relative">
      <div className="absolute inset-0 border-4 border-cyber-primary/30 rounded-full"></div>
      <div 
        className="absolute inset-2 border-4 border-cyber-primary/60 rounded-full"
        style={{ animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite', borderTopColor: 'transparent' }}
      ></div>
      <div 
        className="absolute inset-4 border-2 border-cyber-secondary rounded-full"
        style={{ animation: 'spin-reverse 0.8s linear infinite', borderLeftColor: 'transparent', borderRightColor: 'transparent' }}
      ></div>
    </div>
  );
};

export default Spinner;
