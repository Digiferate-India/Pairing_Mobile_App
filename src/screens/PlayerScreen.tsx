import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
} from 'react-native';
import Video from 'react-native-video';
import { supabase } from '../lib/supabaseClient'; 
import Orientation from 'react-native-orientation-locker'; 

// --- Types (no change) ---
type MediaItem = {
  id: number;
  file_name: string;
  file_path: string;
  file_type: string;
};

type PlaylistItem = {
  id: number;
  duration: number;
  scheduled_time: string | null; 
  media: MediaItem[]; 
  orientation: string;
};

interface PlaylistItemRpcResponse {
  item_id: number;
  duration: number;
  scheduled_time: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  orientation: string;
}

type PlayerScreenProps = {
  screenId: string;
  onExit?: () => void;
};

const PlayerScreen = ({ screenId, onExit }: PlayerScreenProps) => {
  // --- State and Refs ---
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true); 
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isPlayable, setIsPlayable] = useState(false);

  const currentIndexRef = useRef(0);
  const mediaStartTimeRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null); 

  // --- 1. fetchPlaylist & Polling (UPDATED with Network Fix) ---
  useEffect(() => {
    
    // This function now handles *all* fetching and error logic
    const checkStatusAndPlaylist = async () => {
      
      if (isLoading) {
        console.log("Initial load...");
      }
      
      try {
        // 1. Check the screen status
        const { data: status, error: statusError } = await supabase.rpc('get_screen_status', {
          screen_id_to_check: parseInt(screenId, 10)
        });
        if (statusError) throw statusError;

        if (status !== 'paired') {
          console.log('Polling: Status is not "paired". Exiting player...');
          if (isLoading) setIsLoading(false); // Turn off spinner if we exit
          if (onExit) onExit();
          return; // Stop execution
        }

        // 2. Status is 'paired', so fetch the playlist
        const { data: playlistData, error: playlistError } = await supabase.rpc('get_playlist_for_screen', {
          screen_id_to_check: parseInt(screenId, 10) 
        });
        if (playlistError) throw playlistError;

        // 3. SUCCESS!
        if (error) setError(null); // ✅ Clear any previous error
        
        // Process the playlist
        if (playlistData) {
          const formattedPlaylist = playlistData.map((item: PlaylistItemRpcResponse) => ({
            id: item.item_id,
            duration: item.duration,
            scheduled_time: item.scheduled_time, 
            orientation: item.orientation,
            media: [{ 
              id: item.item_id,
              file_name: item.file_name,
              file_path: item.file_path,
              file_type: item.file_type
            }]
          }));
          
          setPlaylist(currentPlaylist => {
            if (JSON.stringify(currentPlaylist) !== JSON.stringify(formattedPlaylist)) {
              console.log('Playlist has changed! Updating state.');
              const now = new Date();
              const currentTimeString = now.toTimeString().split(' ')[0];
              let initialIndex = formattedPlaylist.findIndex(
                (item: PlaylistItem) => !item.scheduled_time || item.scheduled_time <= currentTimeString
              );
              if (initialIndex === -1) {
                initialIndex = 0; 
                setIsPlayable(false);
              } else {
                setIsPlayable(true);
              }
              console.log(`Setting initial index to: ${initialIndex}`);
              currentIndexRef.current = initialIndex;
              mediaStartTimeRef.current = Date.now();
              setCurrentIndex(initialIndex);
              return formattedPlaylist;
            }
            return currentPlaylist;
          });
        } else {
          setPlaylist([]);
          setIsPlayable(false); 
        }

      } catch (err: any) {
        console.error("Polling error:", err.message);
        // ✅ Only update state if error message is new
        if (error !== err.message) { 
          setError(err.message);
        }
      } finally {
        if (isLoading) {
          setIsLoading(false); // Turn off spinner after first load/fail
        }
      }
    };

    // 1. Call it immediately on load
    checkStatusAndPlaylist();
    
    // 2. Set up the interval to poll
    const pollInterval = 4000;
    const intervalId = setInterval(checkStatusAndPlaylist, pollInterval);

    // 3. Cleanup
    return () => {
      console.log('Cleaning up polling interval');
      clearInterval(intervalId);
    };
  
  }, [screenId, onExit, error, isLoading]); // ✅ 'error' and 'isLoading' are now in the dependency array


  // --- 2. The Scheduler (with Flicker Fix) ---
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (playlist.length === 0 || isLoading) {
      console.log('Scheduler: Playlist empty or app is loading.');
      return;
    }
    console.log('Scheduler: Starting new timer.');

    timerRef.current = setInterval(() => {
      const now = new Date();
      const currentTimeString = now.toTimeString().split(' ')[0]; // "HH:mm:ss"
      const currentTimeHHMM = currentTimeString.substring(0, 5); // "HH:mm"

      // 1. HIGH PRIORITY: Check for a scheduled item that is due
      const scheduledItemIndex = playlist.findIndex(
        (item) => item.scheduled_time === currentTimeHHMM
      );
      
      if (scheduledItemIndex !== -1) {
        if (scheduledItemIndex !== currentIndexRef.current) {
          console.log(`Scheduler: Jumping to scheduled item ${scheduledItemIndex}`);
          mediaStartTimeRef.current = Date.now();
          currentIndexRef.current = scheduledItemIndex;
          setCurrentIndex(scheduledItemIndex);
          if (!isPlayable) setIsPlayable(true);
          return;
        }
        
        if (!isPlayable) {
          console.log(`Scheduler: Current item ${scheduledItemIndex} is now playable.`);
          setIsPlayable(true);
          mediaStartTimeRef.current = Date.now(); // RESET THE TIMER
        }
      }

      // 2. Check the current item
      const currentItem = playlist[currentIndexRef.current];
      if (!currentItem) { 
        currentIndexRef.current = 0; 
        setCurrentIndex(0);
        return; 
      } 

      const isItemPlayable = !currentItem.scheduled_time || currentItem.scheduled_time <= currentTimeString;

      if (!isItemPlayable) {
        if (isPlayable) setIsPlayable(false);
        return; 
      }
      
      if (!isPlayable) {
        console.log(`Scheduler: Item ${currentIndexRef.current} just became playable (fallback).`);
        setIsPlayable(true);
        mediaStartTimeRef.current = Date.now(); // RESET THE TIMER
      }

      // 3. Check duration of the (now playable) item
      const durationMs = (currentItem.duration || 5) * 1000;
      const timeElapsed = Date.now() - mediaStartTimeRef.current;

      if (timeElapsed > durationMs) {
        // Time is up. Find the NEXT playable item.
        console.log(`Scheduler: Item ${currentIndexRef.current} duration ended.`);
        let nextPlayableIndex = -1;
        
        for (let i = 1; i < playlist.length; i++) {
          const testIndex = (currentIndexRef.current + i) % playlist.length;
          const item = playlist[testIndex];
          
          if (!item.scheduled_time || item.scheduled_time <= currentTimeString) {
            nextPlayableIndex = testIndex;
            break; 
          }
        }
        
        // This is the flicker fix
        if (nextPlayableIndex !== -1) {
          // We found a *different* playable item
          console.log(`Scheduler: Moving to next item ${nextPlayableIndex}`);
          mediaStartTimeRef.current = Date.now();
          currentIndexRef.current = nextPlayableIndex;
          setCurrentIndex(nextPlayableIndex);
        } else {
          // We did NOT find a *different* playable item.
          // Check if the *current* item is still playable (e.g., single item playlist)
          if (isItemPlayable) {
            // Yes, it's still playable. Just restart it.
            console.log(`Scheduler: Restarting single playable item ${currentIndexRef.current}`);
            mediaStartTimeRef.current = Date.now(); 
          } else {
            // No, the current item is also not playable
            console.log(`Scheduler: No other playable items found. Waiting...`);
            setIsPlayable(false);
          }
        }
      }
      
    }, 1000); 

    return () => {
      console.log('Scheduler: Cleaning up old timer.');
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [playlist, isLoading, isPlayable]); // The dependency array is correct


  // --- 3. Orientation Controller (no change) ---
  useEffect(() => {
    if (playlist.length === 0 || !isPlayable) return;
    
    const currentItem = playlist[currentIndex];
    if (!currentItem) return; 

    const orientation = currentItem.orientation;
    console.log(`Setting orientation for media: ${orientation}`);

    if (orientation === 'landscape') {
      Orientation.lockToLandscape();
    } else if (orientation === 'portrait') {
      Orientation.lockToPortrait();
    } else {
      Orientation.unlockAllOrientations();
    }
    
  }, [currentIndex, playlist, isPlayable]);


  // --- 4. renderCurrentMedia function (no change) ---
  const renderCurrentMedia = () => {
    const currentItem = playlist[currentIndex]; 
    const currentMedia = currentItem?.media[0];
    
    if (!currentItem || !currentMedia) {
      return <View style={styles.container}></View>;
    }
    
    if (currentMedia.file_type.includes('image')) {
        return (
          <Image
            source={{ uri: currentMedia.file_path }}
            style={styles.media}
            resizeMode="contain"
          />
        );
      }
  
      if (currentMedia.file_type.includes('video')) {
        return (
          <>
            <Video
              source={{ uri: currentMedia.file_path }}
              style={styles.media}
              resizeMode="contain"
              repeat={true}
              muted={false} // Sound is ON
              onBuffer={(e) => setIsBuffering(e.isBuffering)}
            />
            {isBuffering && (
              <ActivityIndicator
                style={styles.bufferingIndicator}
                size="large"
                color="#FFFFFF"
              />
            )}
          </> 
        );
      }
      return <Text style={styles.title}>Unsupported media type</Text>;
  };

  // --- 5. HandleRotate function (no change) ---
  const handleRotate = () => {
    const currentItem = playlist[currentIndex];
    const currentOrientation = currentItem?.orientation;
    
    if (currentOrientation === 'landscape' || currentOrientation === 'portrait') {
      console.log(`Rotation locked to ${currentOrientation}. Manual override disabled.`);
      return;
    }
    
    Orientation.getOrientation((orientation) => {
      if (orientation === 'LANDSCAPE-LEFT' || orientation === 'LANDSCAPE-RIGHT') {
        Orientation.lockToPortrait();
      } else {
        Orientation.lockToLandscape();
      }
    });
  };


  // --- 6. Return logic (UPDATED) ---
  
  if (error) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.errorText}>Error: {error}</Text>
          {/* Show a helpful message during a temporary network drop */}
          <Text style={styles.title}>(Retrying in background...)</Text>
        </View>
        {/*
        <TouchableOpacity
          style={styles.exitButton}
          onPress={onExit || (() => console.log('Exit button pressed but no onExit handler'))}
        >
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
        */}
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
        {/*
        <TouchableOpacity
          style={styles.exitButton}
          onPress={onExit || (() => console.log('Exit button pressed but no onExit handler'))}
        >
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
        */}
      </>
    );
  }

  if (playlist.length === 0) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.title}>No content assigned.</Text>
        </View>
        {/*
        <TouchableOpacity
          style={styles.exitButton}
          onPress={onExit || (() => console.log('Exit button pressed but no onExit handler'))}
        >
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
        */}
      </>
    );
  }
  
  if (!isPlayable) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.title}>Waiting for scheduled content...</Text>
        </View>
        {/*
        <TouchableOpacity
          style={styles.exitButton}
          onPress={onExit || (() => console.log('Exit button pressed but no onExit handler'))}
        >
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
        */}
      </>
    );
  }

  // Main player return
  return (
    <>
      <View style={styles.container}>
        {renderCurrentMedia()}
      </View>
      
      {/*
      <TouchableOpacity style={styles.rotateButton} onPress={handleRotate}>
        <Text style={styles.rotateButtonText}>⟳</Text>
      </TouchableOpacity>
      */}

      {/*
      <TouchableOpacity
        style={styles.exitButton}
        onPress={onExit || (() => console.log('Exit button pressed but no onExit handler'))}
      >
        <Text style={styles.exitButtonText}>Exit</Text>
      </TouchableOpacity>
      */}
    </>
  );
};

// --- Styles (No changes) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  bufferingIndicator: {
    position: 'absolute',
  },
  title: {
    color: '#fff',
    fontSize: 24,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  rotateButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  rotateButtonText: {
    color: 'white',
    fontSize: 24,
    transform: [{ rotate: '90deg' }]
  },
  exitButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#FF0000',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PlayerScreen;