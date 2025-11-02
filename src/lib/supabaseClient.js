// In src/lib/supabaseClient.js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tphnlrxdheqvuzcmlfme.supabase.co'; // Paste your URL here
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwaG5scnhkaGVxdnV6Y21sZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4OTY5OTgsImV4cCI6MjA3NDQ3Mjk5OH0.wcwmT8bOIIRTvIR-DJ1IeJldl5uj9PVgdXDMOj349ek'; // Paste your anon key here

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});