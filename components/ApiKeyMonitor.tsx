import React, { useState, useEffect } from 'react';
import { debugApiKeySetup, getDetailedApiStats } from '../services/ApiService';

const ApiKeyMonitor: React.FC = () => {
  const [keyStats, setKeyStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load initial stats
    loadStats();
    
    // Update stats every 10 seconds
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const stats = getDetailedApiStats();
      setKeyStats(stats);
    } catch (error) {
      console.error('Failed to load API stats:', error);
    }
  };

  const runDebugCheck = async () => {
    setIsLoading(true);
    try {
      const debugInfo = debugApiKeySetup();
      console.log('🔍 Debug Information:', debugInfo);
      await loadStats(); // Refresh stats
    } catch (error) {
      console.error('Debug check failed:', error);
    }
    setIsLoading(false);
  };

  if (!keyStats) {
    return (
      <div className="p-4 bg-cyber-surface rounded-lg border border-cyber-primary/30">
        <div className="text-cyber-primary">Loading API key statistics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-cyber-surface p-4 rounded-lg border border-cyber-primary/30">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-cyber-primary">
            🔑 API Key Monitor (11 Keys)
          </h3>
          <button
            onClick={runDebugCheck}
            disabled={isLoading}
            className="px-4 py-2 bg-cyber-accent text-cyber-bg rounded hover:bg-cyber-accent/80 disabled:opacity-50"
          >
            {isLoading ? '🔄 Checking...' : '🔍 Debug Check'}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-cyber-surface p-4 rounded-lg border border-green-500/30">
          <div className="text-green-400 text-2xl font-bold">
            {keyStats.summary.activeKeys}
          </div>
          <div className="text-cyber-dim text-sm">Active Keys</div>
        </div>
        
        <div className="bg-cyber-surface p-4 rounded-lg border border-red-500/30">
          <div className="text-red-400 text-2xl font-bold">
            {keyStats.summary.exhaustedKeys}
          </div>
          <div className="text-cyber-dim text-sm">Exhausted Keys</div>
        </div>
        
        <div className="bg-cyber-surface p-4 rounded-lg border border-blue-500/30">
          <div className="text-blue-400 text-2xl font-bold">
            {keyStats.summary.totalRequests}
          </div>
          <div className="text-cyber-dim text-sm">Total Requests</div>
        </div>
        
        <div className="bg-cyber-surface p-4 rounded-lg border border-purple-500/30">
          <div className="text-purple-400 text-2xl font-bold">
            {keyStats.summary.successRate}
          </div>
          <div className="text-cyber-dim text-sm">Success Rate</div>
        </div>
      </div>

      {/* Distribution Status */}
      <div className="bg-cyber-surface p-4 rounded-lg border border-cyber-primary/30">
        <h4 className="text-lg font-bold text-cyber-primary mb-3">
          🎯 Request Distribution
        </h4>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-cyber-dim">Next Key:</span>
            <span className="ml-2 text-cyber-accent font-mono">
              Key {keyStats.distribution.nextKey}
            </span>
          </div>
          <div>
            <span className="text-cyber-dim">Balance Status:</span>
            <span className={`ml-2 font-bold ${
              keyStats.distribution.isEvenlyDistributed 
                ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {keyStats.distribution.isEvenlyDistributed ? '✅ Balanced' : '⚠️ Unbalanced'}
            </span>
          </div>
        </div>

        {/* Distribution Bar Chart */}
        <div className="space-y-2">
          <div className="text-cyber-dim text-sm">Request Count by Key:</div>
          {keyStats.distribution.requestDistribution.map((count: number, index: number) => {
            const maxCount = Math.max(...keyStats.distribution.requestDistribution, 1);
            const percentage = (count / maxCount) * 100;
            
            return (
              <div key={index} className="flex items-center space-x-2">
                <div className="w-12 text-cyber-dim text-sm">Key {index}:</div>
                <div className="flex-1 bg-cyber-bg rounded-full h-4 relative overflow-hidden">
                  <div 
                    className="h-full bg-cyber-accent transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-cyber-text">
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Key Status */}
      <div className="bg-cyber-surface p-4 rounded-lg border border-cyber-primary/30">
        <h4 className="text-lg font-bold text-cyber-primary mb-3">
          🔍 Individual Key Status
        </h4>
        
        <div className="grid gap-2">
          {keyStats.keyDetails.map((key: any) => (
            <div 
              key={key.index}
              className={`p-3 rounded border ${
                key.status.includes('AVAILABLE') ? 'border-green-500/30 bg-green-500/10' :
                key.status.includes('QUOTA_EXHAUSTED') ? 'border-red-500/30 bg-red-500/10' :
                key.status.includes('DISABLED') ? 'border-yellow-500/30 bg-yellow-500/10' :
                'border-orange-500/30 bg-orange-500/10'
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-cyber-accent">Key {key.index}</span>
                  <span className="text-sm">{key.status}</span>
                </div>
                <div className="flex space-x-4 text-sm text-cyber-dim">
                  <span>Requests: {key.requestCount}</span>
                  <span>Errors: {key.errorCount}</span>
                  {key.cooldownRemaining !== '0s' && (
                    <span className="text-orange-400">
                      Cooldown: {key.cooldownRemaining}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Retry Configuration */}
      <div className="bg-cyber-surface p-4 rounded-lg border border-cyber-primary/30">
        <h4 className="text-lg font-bold text-cyber-primary mb-3">
          ⚙️ Enhanced Retry Configuration
        </h4>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-cyber-dim">Max Attempts:</span>
            <div className="text-cyber-accent font-mono">
              {Math.max(keyStats.summary.totalKeys * 2, 11)}
            </div>
          </div>
          <div>
            <span className="text-cyber-dim">Base Delay:</span>
            <div className="text-cyber-accent font-mono">1000ms</div>
          </div>
          <div>
            <span className="text-cyber-dim">Max Delay:</span>
            <div className="text-cyber-accent font-mono">8000ms</div>
          </div>
          <div>
            <span className="text-cyber-dim">Strategy:</span>
            <div className="text-cyber-accent font-mono">Try All Keys</div>
          </div>
        </div>
        
        <div className="mt-3 p-3 bg-cyber-bg/50 rounded border border-cyber-dim/20">
          <div className="text-cyber-dim text-sm">
            <strong>Enhanced Retry Logic:</strong> The system will now attempt to use all 11 API keys 
            before giving up. Each key gets at least 2 chances, and the system tracks which keys 
            have been tried to ensure maximum coverage.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyMonitor;
