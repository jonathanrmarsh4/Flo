import { getSupabaseClient } from './server/services/supabaseClient';
import OpenAI from 'openai';

async function testSupabaseConnection() {
  console.log('\n🔍 Testing Supabase connection...');
  try {
    const supabase = getSupabaseClient();
    
    // Test 1: Check if we can query the health_embeddings table
    const { data, error } = await supabase
      .from('health_embeddings')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase query failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    console.log(`   - Can query health_embeddings table`);
    console.log(`   - Current embeddings count: ${data?.length || 0}`);
    return true;
  } catch (error: any) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

async function testGrokConnection() {
  console.log('\n🤖 Testing Grok (xAI) connection...');
  try {
    const xaiApiKey = process.env.XAI_API_KEY;
    
    if (!xaiApiKey) {
      console.error('❌ XAI_API_KEY not found in environment');
      return false;
    }
    
    const openai = new OpenAI({
      apiKey: xaiApiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    
    // Test with a simple completion
    const completion = await openai.chat.completions.create({
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: 'Reply with just: OK' }],
      max_tokens: 10,
    });
    
    const response = completion.choices[0]?.message?.content || '';
    
    if (response.toLowerCase().includes('ok')) {
      console.log('✅ Grok connection successful');
      console.log(`   - Model: grok-beta`);
      console.log(`   - Response: ${response.trim()}`);
      return true;
    } else {
      console.error('❌ Unexpected response from Grok:', response);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Grok connection failed:', error.message);
    if (error.response) {
      console.error('   - Status:', error.response.status);
      console.error('   - Data:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting connection tests...\n');
  console.log('=' .repeat(50));
  
  const supabaseOk = await testSupabaseConnection();
  const grokOk = await testGrokConnection();
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results:');
  console.log(`   Supabase: ${supabaseOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Grok:     ${grokOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (supabaseOk && grokOk) {
    console.log('\n🎉 All connections are working!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some connections failed. Please check the errors above.\n');
    process.exit(1);
  }
}

runTests();
