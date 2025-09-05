import React from 'react';
import { Challenge, ChallengeStatus } from '../types';

interface ChallengeSelectorProps {
  challenges: Challenge[];
  statuses: ChallengeStatus[];
  currentChallengeId: number;
  onSelectChallenge: (index: number) => void;
}

const challengePoints = [
  { cx: 100, cy: 60 }, { cx: 160, cy: 140 }, { cx: 100, cy: 220 },
  { cx: 160, cy: 300 }, { cx: 100, cy: 380 }, { cx: 160, cy: 460 },
];

const roadPathD = challengePoints.map((p, i) => {
    if (i === 0) return `M ${p.cx} ${p.cy}`;
    const prev = challengePoints[i-1];
    return `C ${prev.cx} ${prev.cy + 40}, ${p.cx} ${p.cy - 40}, ${p.cx} ${p.cy}`;
}).join(' ');

// SVG path data for icons
const ICONS = {
    LOCK: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z",
    CHECK: "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
};

const Hexagon: React.FC<{ size: number }> = ({ size }) => {
    const points = Array.from({ length: 6 }).map((_, i) => {
        const angle_deg = 60 * i - 30;
        const angle_rad = Math.PI / 180 * angle_deg;
        const x = size * Math.cos(angle_rad);
        const y = size * Math.sin(angle_rad);
        return `${x},${y}`;
    }).join(' ');
    return <polygon points={points} />;
};

const ChallengeSelector: React.FC<ChallengeSelectorProps> = ({ challenges, statuses, currentChallengeId, onSelectChallenge }) => {
  return (
    <div className="bg-cyber-surface/70 backdrop-blur-sm rounded-lg p-4 border-2 border-cyber-primary/30 flex flex-col animate-border-flicker h-full">
      <h2 className="text-2xl font-display font-bold mb-4 text-cyber-primary text-center tracking-widest">MISSIONS</h2>
      <div className="flex-1">
        <svg viewBox="0 0 260 520" width="100%" height="100%" preserveAspectRatio="none">
            <path d={roadPathD} stroke="url(#line-gradient)" strokeWidth="6" fill="none" />
            <defs>
                <linearGradient id="line-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#00f2ff', stopOpacity: 0.5 }} />
                    <stop offset="100%" style={{ stopColor: '#ff00ff', stopOpacity: 0.8 }} />
                </linearGradient>
            </defs>

            {challenges.map((challenge, index) => {
                const status = statuses[index] || ChallengeStatus.LOCKED;
                const isCurrent = challenge.id === currentChallengeId;
                const isLocked = status === ChallengeStatus.LOCKED;
                const isCompleted = status === ChallengeStatus.COMPLETED;
                const point = challengePoints[index];

                let nodeColor = 'fill-cyber-dim/30 stroke-cyber-dim/50';
                if (isCompleted) nodeColor = 'fill-cyber-accent/30 stroke-cyber-accent';
                if (!isLocked && !isCompleted) nodeColor = 'fill-cyber-primary/30 stroke-cyber-primary';
                if (isCurrent) nodeColor = 'fill-cyber-secondary/40 stroke-cyber-secondary';

                return (
                    <g 
                        key={challenge.id}
                        transform={`translate(${point.cx}, ${point.cy})`}
                        onClick={() => !isLocked && onSelectChallenge(index)}
                        className={isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer group'}
                        aria-label={`Challenge ${challenge.id}: ${challenge.name} - ${status}`}
                    >
                        {isCurrent && (
                           <g className="animate-spin" style={{animationDuration: '4s', transformOrigin: 'center'}}>
                                <Hexagon size={28} />
                                <path className="fill-cyber-secondary/50 stroke-cyber-secondary" strokeWidth="2" />
                            </g>
                        )}
                        
                        <g className="transition-transform duration-200 group-hover:scale-110">
                            <Hexagon size={24} />
                             <path className={nodeColor} strokeWidth="3" />
                        </g>
                        
                        {isLocked && <path d={ICONS.LOCK} transform="scale(0.8) translate(-15, -15)" className="fill-cyber-dim"/>}
                        {isCompleted && <path d={ICONS.CHECK} transform="translate(-12, -12)" className="fill-cyber-accent"/>}
                        {!isLocked && !isCompleted && 
                            <text textAnchor="middle" dy="0.35em" fontSize="18" className="fill-cyber-text font-bold pointer-events-none">
                                {challenge.id}
                            </text>
                        }

                        <text
                          textAnchor={point.cx > 130 ? "end" : "start"}
                          x={point.cx > 130 ? -40 : 40}
                          dy="0.3em"
                          fontSize="14"
                          className="fill-cyber-text opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none font-bold"
                        >
                            {challenge.name}
                        </text>
                    </g>
                )
            })}
        </svg>
      </div>
    </div>
  );
};

export default ChallengeSelector;