import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PairingScreen from './src/screens/PairingScreen';
import PlayerScreen from './src/screens/PlayerScreen';

const App = () => {
  const [screenId, setScreenId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkPairingStatus = async () => {
      const storedScreenId = await AsyncStorage.getItem('screen_id');
      if (storedScreenId) {
        setScreenId(storedScreenId);
      }
      setIsLoading(false);
    };
    checkPairingStatus();
  }, []);

  const handlePairSuccess = async (id: string) => {
    try {
      await AsyncStorage.setItem('screen_id', id);
      setScreenId(id);
    } catch (e) {
      Alert.alert('Error', 'Could not save screen ID.');
    }
  };

  const handleExit = async () => {
    try {
      await AsyncStorage.removeItem('screen_id');
      setScreenId(null);
    } catch (e) {
      Alert.alert('Error', 'Could not clear screen ID.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {screenId ? (
        <PlayerScreen screenId={screenId} onExit={handleExit} />
      ) : (
        <PairingScreen onPairSuccess={handlePairSuccess} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
});

export default App;