// Test file to demonstrate 8-key API distribution
// Run with: node test-8-keys.js

import { debugApiKeySetup, testApiKeyDistribution, getDetailedApiStats } from './services/ApiService.js';

async function test8KeySetup() {
  console.log('🚀 Testing 8-Key API Setup\n');
  
  // 1. Debug API key setup
  console.log('='.repeat(50));
  console.log('1. API Key Setup Verification');
  console.log('='.repeat(50));
  const debugInfo = debugApiKeySetup();
  console.log(`Total keys found: ${debugInfo.keyManagerStats.summary.totalKeys}/8`);
  
  // 2. Show current stats
  console.log('\n' + '='.repeat(50));
  console.log('2. Initial Key Statistics');
  console.log('='.repeat(50));
  const initialStats = getDetailedApiStats();
  console.table(initialStats.keyDetails.map(key => ({
    'Key Index': key.index,
    'Status': key.status,
    'Requests': key.requestCount,
    'Errors': key.errorCount,
    'Last Used': key.lastUsed
  })));
  
  // 3. Test distribution (optional - only if you want to make actual API calls)
  if (process.argv.includes('--test-requests')) {
    console.log('\n' + '='.repeat(50));
    console.log('3. Testing Request Distribution (5 test requests)');
    console.log('='.repeat(50));
    
    try {
      const distributionTest = await testApiKeyDistribution(5);
      console.log('\nDistribution Test Results:');
      console.log(`Success Rate: ${(distributionTest.successRate * 100).toFixed(1)}%`);
      console.log(`Even Distribution: ${distributionTest.isEvenlyDistributed ? '✅ Yes' : '❌ No'}`);
      console.log(`Request Distribution: [${distributionTest.finalDistribution.join(', ')}]`);
      
    } catch (error) {
      console.error('Distribution test failed:', error.message);
    }
  } else {
    console.log('\n💡 To test actual API calls, run: node test-8-keys.js --test-requests');
  }
  
  // 4. Show expected distribution pattern
  console.log('\n' + '='.repeat(50));
  console.log('4. Expected Distribution Pattern');
  console.log('='.repeat(50));
  console.log('Round-robin sequence: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 0 → ...');
  console.log('With 8 keys, each key should handle ~12.5% of total requests');
  console.log('Benefits:');
  console.log('  • 8x higher rate limit capacity');
  console.log('  • Better fault tolerance');
  console.log('  • Reduced quota exhaustion');
  console.log('  • More even load distribution');
}

// Run the test
test8KeySetup().catch(console.error);
