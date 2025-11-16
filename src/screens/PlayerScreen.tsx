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
  start_time: string | null; 
  end_time: string | null;   
  media: MediaItem[]; 
  orientation: string;
};

interface PlaylistItemRpcResponse {
  item_id: number;
  duration: number;
  start_time: string | null; 
  end_time: string | null;   
  file_name: string;
  file_path: string;
  file_type: string;
  orientation: string;
}

type PlayerScreenProps = {
  screenId: string;
  onExit?: () => void;
};

// --- Helper function (UPDATED with Bug Fix) ---
const checkPlayability = (item: PlaylistItem, now: Date): boolean => {
  const hasNoStartTime = !item.start_time;
  // ✅ FIX: Use !! to cast the result to a boolean
  const hasStarted = !!item.start_time && (new Date(item.start_time) <= now); 
  
  const hasNoEndTime = !item.end_time;
  // ✅ FIX: Use !! to cast the result to a boolean
  const hasNotEnded = !!item.end_time && (new Date(item.end_time) > now); 

  // Playable if:
  // (It has no start time OR it has already started)
  // AND
  // (It has no end time OR it has not ended yet)
  return (hasNoStartTime || hasStarted) && (hasNoEndTime || hasNotEnded);
};


const PlayerScreen = ({ screenId, onExit }: PlayerScreenProps) => {
  // --- State and Refs (no change) ---
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true); 
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayable, setIsPlayable] = useState(false);
  const currentIndexRef = useRef(0);
  const mediaStartTimeRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null); 

  // --- 1. fetchPlaylist & Polling (no change) ---
  useEffect(() => {
    
    const checkStatusAndPlaylist = async () => {
      if (isLoading) {
        console.log("Initial load...");
      }
      
      try {
        const { data: status, error: statusError } = await supabase.rpc('get_screen_status', {
          screen_id_to_check: parseInt(screenId, 10)
        });
        if (statusError) throw statusError;

        if (status !== 'paired') {
          console.log('Polling: Status is not "paired". Exiting player...');
          if (isLoading) setIsLoading(false);
          if (onExit) onExit();
          return;
        }

        const { data: playlistData, error: playlistError } = await supabase.rpc('get_playlist_for_screen', {
          screen_id_to_check: parseInt(screenId, 10) 
        });
        if (playlistError) throw playlistError;

        if (error) setError(null);
        
        if (playlistData) {
          const formattedPlaylist = playlistData.map((item: PlaylistItemRpcResponse) => ({
            id: item.item_id,
            duration: item.duration,
            start_time: item.start_time, 
            end_time: item.end_time,     
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
              
              let initialIndex = formattedPlaylist.findIndex(
                (item: PlaylistItem) => checkPlayability(item, now)
              );

              if (initialIndex === -1) {
                console.log("No playable items found for initial load.");
                initialIndex = 0; 
                setIsPlayable(false);
              } else {
                console.log("Playable items found.");
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
        if (error !== err.message) { 
          setError(err.message);
        }
      } finally {
        if (isLoading) {
          setIsLoading(false);
        }
      }
    };

    checkStatusAndPlaylist();
    const pollInterval = 4000;
    const intervalId = setInterval(checkStatusAndPlaylist, pollInterval);

    return () => {
      console.log('Cleaning up polling interval');
      clearInterval(intervalId);
    };
  
  }, [screenId, onExit, error, isLoading]);


  // --- 2. The Scheduler (no change) ---
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

      // 1. HIGH PRIORITY: Check for a scheduled item that is due to *start*
      const scheduledItemIndex = playlist.findIndex(
        (item) => {
          if (!item.start_time) return false; // Must have a start time
          const startDate = new Date(item.start_time);
          // Check if the start time is within the current second
          return startDate >= now && startDate.getTime() < (now.getTime() + 1000);
        }
      );
      
      if (scheduledItemIndex !== -1) {
        if (scheduledItemIndex !== currentIndexRef.current) {
          if (checkPlayability(playlist[scheduledItemIndex], now)) {
            console.log(`Scheduler: Jumping to scheduled item ${scheduledItemIndex}`);
            mediaStartTimeRef.current = Date.now();
            currentIndexRef.current = scheduledItemIndex;
            setCurrentIndex(scheduledItemIndex);
            if (!isPlayable) setIsPlayable(true);
            return;
          }
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

      const isItemPlayable = checkPlayability(currentItem, now);

      if (!isItemPlayable) {
        if (isPlayable) setIsPlayable(false); // Set to "Waiting..."
        
        let nextPlayableIndex = -1;
        for (let i = 0; i < playlist.length; i++) { 
          if (i === currentIndexRef.current) continue; 
          
          if (checkPlayability(playlist[i], now)) {
            nextPlayableIndex = i;
            break;
          }
        }

        if (nextPlayableIndex !== -1) {
          console.log(`Scheduler: Current item expired. Jumping to next playable item ${nextPlayableIndex}`);
          mediaStartTimeRef.current = Date.now();
          currentIndexRef.current = nextPlayableIndex;
          setCurrentIndex(nextPlayableIndex);
          setIsPlayable(true);
        }
        
        return; 
      }
      
      if (!isPlayable) {
        console.log(`Scheduler: Item ${currentIndexRef.current} just became playable (fallback).`);
        setIsPlayable(true);
        mediaStartTimeRef.current = Date.now(); 
      }

      // 3. Check duration of the (now playable) item
      const durationMs = (currentItem.duration || 5) * 1000;
      const timeElapsed = Date.now() - mediaStartTimeRef.current;

      if (timeElapsed > durationMs) {
        console.log(`Scheduler: Item ${currentIndexRef.current} duration ended.`);
        let nextPlayableIndex = -1;
        
        for (let i = 1; i < playlist.length; i++) {
          const testIndex = (currentIndexRef.current + i) % playlist.length;
          
          if (checkPlayability(playlist[testIndex], now)) {
            nextPlayableIndex = testIndex;
            break; 
          }
        }
        
        if (nextPlayableIndex !== -1) {
          console.log(`Scheduler: Moving to next item ${nextPlayableIndex}`);
          mediaStartTimeRef.current = Date.now();
          currentIndexRef.current = nextPlayableIndex;
          setCurrentIndex(nextPlayableIndex);
        } else {
          if (isItemPlayable) {
            console.log(`Scheduler: Restarting single playable item ${currentIndexRef.current}`);
            mediaStartTimeRef.current = Date.now(); 
          } else {
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
  }, [playlist, isLoading, isPlayable]);


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


  // --- 6. Return logic (Buttons commented out) ---
  
  if (error) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Text style={styles.title}>(Retrying in background...)</Text>
        </View>
        {/* ... exit button commented ... */}
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
        {/* ... exit button commented ... */}
      </>
    );
  }

  if (playlist.length === 0) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.title}>No content assigned.</Text>
        </View>
        {/* ... exit button commented ... */}
      </>
    );
  }
  
  if (!isPlayable) {
    return (
      <>
        <View style={styles.container}>
          <Text style={styles.title}>Waiting for scheduled content...</Text>
        </View>
        {/* ... exit button commented ... */}
      </>
    );
  }

  // Main player return
  return (
    <>
      <View style={styles.container}>
        {renderCurrentMedia()}
      </View>
      
      {/* ... rotate button commented ... */}
      {/* ... exit button commented ... */}
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