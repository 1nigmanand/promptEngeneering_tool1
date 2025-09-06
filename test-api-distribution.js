// Test API Key Distribution with Enhanced Retry Logic
// Run this with: node test-api-distribution.js

import { debugApiKeySetup, testApiKeyDistribution } from './services/ApiService.js';

async function runDistributionTest() {
  console.log('🚀 Starting API Key Distribution Test...\n');
  
  // First, debug the setup
  console.log('='.repeat(60));
  console.log('STEP 1: Debugging API Key Setup');
  console.log('='.repeat(60));
  
  const debugInfo = debugApiKeySetup();
  
  if (!debugInfo.allKeysWorking) {
    console.log('❌ Warning: Not all keys are working properly!');
    if (debugInfo.keyManagerStats.summary.totalKeys === 0) {
      console.log('🔥 CRITICAL: No API keys loaded! Check your .env.local file.');
      return;
    }
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test distribution
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: Testing Request Distribution (10 requests)');
  console.log('='.repeat(60));
  
  try {
    const testResults = await testApiKeyDistribution(10);
    
    console.log('\n📊 FINAL TEST RESULTS:');
    console.log('✅ Success Rate:', `${(testResults.successRate * 100).toFixed(1)}%`);
    console.log('🎯 Evenly Distributed:', testResults.isEvenlyDistributed ? 'Yes' : 'No');
    console.log('📈 Request Distribution:', testResults.finalDistribution);
    
    // Show which keys were used
    const keysUsed = testResults.testResults
      .filter(r => r.success)
      .map(r => r.keyUsed)
      .reduce((acc, key) => {
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    
    console.log('🔑 Keys Used:', keysUsed);
    
    if (testResults.successRate < 0.5) {
      console.log('\n⚠️  WARNING: Low success rate detected!');
      console.log('This might indicate:');
      console.log('- Invalid API keys');
      console.log('- Network connectivity issues');
      console.log('- All keys hitting rate limits simultaneously');
    } else {
      console.log('\n🎉 Test completed successfully!');
      console.log('The enhanced retry mechanism is working correctly.');
      console.log('All 11 keys will be tried before giving up.');
    }
    
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    
    // Show what we can learn from the failure
    console.log('\n🔍 Debugging the failure:');
    const finalDebug = debugApiKeySetup();
    console.log('Keys currently active:', finalDebug.keyManagerStats.summary.activeKeys);
    console.log('Keys with errors:', finalDebug.keyManagerStats.summary.totalErrors);
  }
}

// Run the test
runDistributionTest().catch(console.error);
