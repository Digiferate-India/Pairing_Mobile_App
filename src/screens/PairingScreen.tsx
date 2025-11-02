import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient'; // Make sure this path is correct

type PairingScreenProps = {
  onPairSuccess: (id: string) => void;
};

const PairingScreen = ({ onPairSuccess }: PairingScreenProps) => {
  const [pairingCode, setPairingCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- This is the updated function ---
  const handlePairing = async () => {
    if (!pairingCode.trim()) {
      Alert.alert('Error', 'Please enter a pairing code.');
      return;
    }
    setIsLoading(true);

    try {
      // Step 1: Call the 'pair_screen' function we made in the SQL Editor
      const { data, error } = await supabase.rpc('pair_screen', {
        code_to_check: pairingCode.trim().toUpperCase()
      });

      if (error) throw error; // Handle any database errors

      // Step 2: Check if the function returned any data
      if (data && data.length > 0) {
        // Success! The function found, updated, and returned the screen
        const screenDetails = data[0]; 

        // 3. Save the ID to the device's local storage
        await AsyncStorage.setItem('screen_id', String(screenDetails.id));

        // 4. Tell the App.tsx that pairing was successful
        onPairSuccess(String(screenDetails.id));
        
      } else {
        // The function returned nothing, so the code was invalid
        setIsLoading(false);
        Alert.alert('Pairing Failed', 'Invalid pairing code. Please try again.');
      }

    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Pairing Error', 'An error occurred: ' + err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair Your Screen</Text>
      <Text style={styles.subtitle}>
        Enter the code displayed on your CMS dashboard.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Enter Pairing Code"
        placeholderTextColor="#9A9A9A"
        autoCapitalize="characters"
        value={pairingCode}
        onChangeText={setPairingCode}
      />
      <TouchableOpacity style={styles.button} onPress={handlePairing} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Pair Device</Text>}
      </TouchableOpacity>
    </View>
  );
};

// --- Styles (no changes) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#F5F5F5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 8,
    fontSize: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 50,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PairingScreen;