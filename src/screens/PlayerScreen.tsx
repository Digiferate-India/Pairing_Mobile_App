import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Text,
  // TouchableOpacity removed to fix unused var warning
} from 'react-native';
import Video from 'react-native-video';
import { supabase } from '../lib/supabaseClient'; 
import Orientation from 'react-native-orientation-locker'; 

// --- Types ---
type MediaItem = {
  id: number;
  file_name: string;
  file_path: string;
  file_type: string;
};

type PlaylistItem = {
  id: number;
  duration: number | null; // Can be null (Auto)
  start_time: string | null; 
  end_time: string | null;   
  media: MediaItem[]; 
  orientation: string;
};

interface PlaylistItemRpcResponse {
  item_id: number;
  duration: number | null; 
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

const PlayerScreen = ({ screenId, onExit }: PlayerScreenProps) => {
  // --- State ---
  const [fullPlaylist, setFullPlaylist] = useState<PlaylistItem[]>([]); 
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem[]>([]); 
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true); 
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ Timers typed correctly for React Native
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 1. Fetch Data from DB ---
  useEffect(() => {
    const fetchData = async () => {
      if (isLoading) console.log("Fetching playlist...");
      
      try {
        // Check Status
        const { data: status, error: statusError } = await supabase.rpc('get_screen_status', {
          screen_id_to_check: parseInt(screenId, 10)
        });
        if (statusError) throw statusError;
        if (status !== 'paired') {
          if (onExit) onExit();
          return;
        }

        // Fetch Playlist
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
          
          // Update state only if data changed
          setFullPlaylist(prev => {
             if (JSON.stringify(prev) !== JSON.stringify(formattedPlaylist)) {
               console.log("Playlist data updated from DB");
               return formattedPlaylist;
             }
             return prev;
          });
        } else {
          setFullPlaylist([]);
        }

      } catch (err: any) {
        console.error("Error:", err.message);
        setError(err.message);
      } finally {
        if (isLoading) setIsLoading(false);
      }
    };

    fetchData();
    const pollInterval = setInterval(fetchData, 10000); // Poll every 10s
    return () => clearInterval(pollInterval);
  }, [screenId, onExit, error, isLoading]);


  // --- 2. The Scheduler (Determines Priority vs Default) ---
  useEffect(() => {
    const checkSchedule = () => {
      if (fullPlaylist.length === 0) return;

      const now = new Date();

      // Priority A: Scheduled Items Active NOW
      const scheduledItems = fullPlaylist.filter(item => {
        // Must have BOTH start and end time to be a "Scheduled Item"
        if (!item.start_time || !item.end_time) return false; 
        const start = new Date(item.start_time);
        const end = new Date(item.end_time);
        // Is 'now' inside the window?
        return start <= now && end > now;
      });

      // Priority B: Default Items (No Schedule)
      const defaultItems = fullPlaylist.filter(item => 
        !item.start_time && !item.end_time
      );

      let newQueue: PlaylistItem[] = [];
      
      if (scheduledItems.length > 0) {
        newQueue = scheduledItems; // Play only scheduled content
      } else {
        newQueue = defaultItems; // Play default loop
      }

      // Update active playlist if queue composition changed
      setActivePlaylist(currentQueue => {
        const currentIds = currentQueue.map(i => i.id).join(',');
        const newIds = newQueue.map(i => i.id).join(',');
        
        if (currentIds !== newIds) {
          console.log(`Switching Mode. New Queue Length: ${newQueue.length}`);
          setCurrentIndex(0); 
          return newQueue;
        }
        return currentQueue;
      });
    };

    checkSchedule(); 
    scheduleIntervalRef.current = setInterval(checkSchedule, 1000); 

    return () => {
      if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
    };
  }, [fullPlaylist]);


  // --- 3. Playback Controller (Handles Durations) ---
  
  const advanceToNext = useCallback(() => {
    setActivePlaylist(currentQueue => {
      if (currentQueue.length === 0) return currentQueue;
      // Loop to next index
      setCurrentIndex(prevIndex => (prevIndex + 1) % currentQueue.length);
      return currentQueue;
    });
  }, []);

  useEffect(() => {
    // Clear timer on unmount or change
    if (durationTimerRef.current) {
      clearTimeout(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (activePlaylist.length === 0) return;

    const currentItem = activePlaylist[currentIndex];
    if (!currentItem) return; 

    const mediaType = currentItem.media[0]?.file_type || '';
    const isVideo = mediaType.includes('video');
    
    let timeToStay = 0;

    if (currentItem.duration) {
      // CASE 1: Explicit Duration Set
      timeToStay = currentItem.duration * 1000; 
    } else {
      // CASE 2: Auto Duration (Null)
      if (!isVideo) {
        timeToStay = 3000; // Image Default: 3 seconds
      } else {
        timeToStay = 0; // Video Default: Wait for 'onEnd'
      }
    }

    console.log(`Playing item ${currentIndex} (${isVideo ? 'Video' : 'Image'}). Timer: ${timeToStay > 0 ? timeToStay + 'ms' : 'Full Length'}`);

    if (timeToStay > 0) {
      durationTimerRef.current = setTimeout(() => {
        advanceToNext();
      }, timeToStay);
    }

  }, [currentIndex, activePlaylist, advanceToNext]);


  // --- 4. Orientation Controller ---
  useEffect(() => {
    const currentItem = activePlaylist[currentIndex];
    if (!currentItem) {
      Orientation.unlockAllOrientations();
      return;
    }

    const orientation = currentItem.orientation;
    if (orientation === 'landscape') {
      Orientation.lockToLandscape();
    } else if (orientation === 'portrait') {
      Orientation.lockToPortrait();
    } else {
      Orientation.unlockAllOrientations();
    }
  }, [currentIndex, activePlaylist]);


  // --- 5. Render ---
  const renderCurrentMedia = () => {
    const currentItem = activePlaylist[currentIndex];
    if (!currentItem) return null;
    const currentMedia = currentItem.media[0];
    
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
      // If duration IS set, we loop the video until the timer kills it.
      // If duration is NULL (Auto), we play once and advance onEnd.
      const shouldLoopVideo = !!currentItem.duration;

      return (
        <>
          <Video
            source={{ uri: currentMedia.file_path }}
            style={styles.media}
            resizeMode="contain"
            muted={false}
            repeat={shouldLoopVideo} 
            onEnd={() => {
              // Only advance on finish if we are in "Auto" mode
              if (!currentItem.duration) {
                console.log("Video finished. Advancing...");
                advanceToNext();
              }
            }}
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

    return <Text style={styles.title}>Unsupported media</Text>;
  };

  // --- Error / Loading States ---
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Text style={styles.title}>(Retrying...)</Text>
      </View>
    );
  }

  if (isLoading && fullPlaylist.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (activePlaylist.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Waiting for scheduled content...</Text>
        <Text style={styles.waitingText}>
          {fullPlaylist.length > 0 
            ? "Content exists but is not currently scheduled." 
            : "No content assigned to this screen."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderCurrentMedia()}
      {/* Exit button is currently hidden/commented out in JSX above */}
    </View>
  );
};

// --- Styles ---
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
    textAlign: 'center',
  },
  waitingText: {
    color: '#aaa',
    marginTop: 10,
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  exitButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
    borderRadius: 8,
    padding: 10,
    zIndex: 1000,
  },
  exitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default PlayerScreen;