import React from 'react';

interface SimilarityMeterProps {
  score: number;
}

const SimilarityMeter: React.FC<SimilarityMeterProps> = ({ score }) => {
  const scoreHeight = Math.max(0, Math.min(100, score));

  return (
    <div className="absolute top-0 right-0 h-full w-12 flex flex-col justify-end p-2" aria-label={`Similarity score: ${score}%`}>
      <div className="relative h-full w-full bg-cyber-bg/50 border-2 border-cyber-primary/50 rounded-lg overflow-hidden flex flex-col justify-end">
        {/* Elixir Fill */}
        <div
          className="relative w-full bg-gradient-to-t from-cyber-secondary to-cyber-primary transition-all duration-1000 ease-out liquid-fill overflow-hidden"
          style={{ height: `${scoreHeight}%` }}
        >
          {/* Bubbles */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white/30 rounded-full animate-bubble"
                style={{
                  left: `${Math.random() * 80 + 10}%`,
                  animationDuration: `${Math.random() * 3 + 2}s`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Graduation Marks */}
        <div className="absolute inset-0 flex flex-col-reverse justify-between py-2 px-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className={`h-px w-full ${i % 5 === 0 ? 'bg-cyber-primary' : 'bg-cyber-primary/30'}`} />
          ))}
        </div>
        
      </div>
      <style>{`
        @keyframes bubble {
          0% { transform: translateY(0) scale(1); opacity: 0.8; }
          100% { transform: translateY(-300px) scale(1.5); opacity: 0; }
        }
        .animate-bubble {
          animation-name: bubble;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        /* Liquid wave effect */
        .liquid-fill::before,
        .liquid-fill::after {
          content: "";
          position: absolute;
          width: 200%;
          height: 200%;
          top: -195%;
          left: -50%;
          background: #0a0a1a; /* cyber-bg from tailwind config */
          border-radius: 45%;
          animation: liquid-wave 10s linear infinite;
        }

        .liquid-fill::after {
          border-radius: 40%;
          background: #0a0a1a;
          animation-duration: 12s;
          opacity: 0.7;
        }

        @keyframes liquid-wave {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SimilarityMeter;