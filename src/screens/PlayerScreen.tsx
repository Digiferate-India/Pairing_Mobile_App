import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Text,
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
  duration: number | null; // Nullable duration
  // One-time schedule fields
  start_time: string | null; 
  end_time: string | null;   
  // Recurring schedule fields
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  days_of_week: string | null;
  
  media: MediaItem[]; 
  orientation: string;
};

interface PlaylistItemRpcResponse {
  item_id: number;
  duration: number | null;
  start_time: string | null;
  end_time: string | null;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  days_of_week: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  orientation: string;
}

type PlayerScreenProps = {
  screenId: string;
  onExit?: () => void;
};

// Helper to check if a specific item is scheduled for "NOW"
const isItemScheduledNow = (item: PlaylistItem, now: Date): boolean => {
  // 1. Check One-Time Schedule (Specific Date & Time range)
  if (item.start_time && item.end_time) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (now >= start && now < end) {
      return true;
    }
  }

  // 2. Check Recurring Schedule
  if (item.schedule_start_date && item.schedule_end_date && 
      item.daily_start_time && item.daily_end_time && item.days_of_week) {
    
    // A. Check Date Range
    // Note: We treat dates as YYYY-MM-DD strings to avoid timezone issues for simple date checks
    const currentDateString = now.toISOString().split('T')[0];
    if (currentDateString < item.schedule_start_date || currentDateString > item.schedule_end_date) {
      return false;
    }

    // B. Check Day of Week
    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = daysMap[now.getDay()];
    if (!item.days_of_week.includes(currentDay)) {
      return false;
    }

    // C. Check Time Window
    // Convert everything to minutes for easy comparison
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = item.daily_start_time.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;

    const [endHour, endMin] = item.daily_end_time.split(':').map(Number);
    const endMinutes = endHour * 60 + endMin;

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return true;
    }
  }

  return false;
};

const PlayerScreen = ({ screenId, onExit }: PlayerScreenProps) => {
  // --- State ---
  const [fullPlaylist, setFullPlaylist] = useState<PlaylistItem[]>([]); 
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem[]>([]); 
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true); 
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // This key forces the Video component to re-mount when we want to restart it
  const [playbackKey, setPlaybackKey] = useState(0);

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
            schedule_start_date: item.schedule_start_date,
            schedule_end_date: item.schedule_end_date,
            daily_start_time: item.daily_start_time,
            daily_end_time: item.daily_end_time,
            days_of_week: item.days_of_week,
            orientation: item.orientation,
            media: [{ 
              id: item.item_id,
              file_name: item.file_name,
              file_path: item.file_path,
              file_type: item.file_type
            }]
          }));
          
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


  // --- 2. The Scheduler (Determines WHAT to play) ---
  useEffect(() => {
    const checkSchedule = () => {
      if (fullPlaylist.length === 0) return;

      const now = new Date();

      // Priority A: Find items scheduled for NOW
      const scheduledItems = fullPlaylist.filter(item => isItemScheduledNow(item, now));

      // Priority B: Default items (No schedule constraints at all)
      // Items with ANY schedule fields set are considered "scheduled items" 
      // and are excluded from the default loop unless their schedule is active.
      const defaultItems = fullPlaylist.filter(item => 
        !item.start_time && !item.end_time && 
        !item.schedule_start_date
      );

      let newQueue: PlaylistItem[] = [];
      
      if (scheduledItems.length > 0) {
        newQueue = scheduledItems; // Play scheduled content
      } else {
        newQueue = defaultItems; // Fallback to default loop
      }

      // Update active playlist if queue composition changed
      setActivePlaylist(currentQueue => {
        const currentIds = currentQueue.map(i => i.id).join(',');
        const newIds = newQueue.map(i => i.id).join(',');
        
        if (currentIds !== newIds) {
          console.log(`Switching Mode. New Queue Length: ${newQueue.length}`);
          setCurrentIndex(0); 
          setPlaybackKey(k => k + 1); // Force refresh
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


  // --- 3. Playback Controller (Determines WHEN to advance) ---
  
  const advanceToNext = useCallback(() => {
    setActivePlaylist(currentQueue => {
      if (currentQueue.length === 0) return currentQueue;
      
      setPlaybackKey(prevKey => prevKey + 1); // Always force re-render for videos
      
      const nextIndex = (currentIndex + 1) % currentQueue.length;
      setCurrentIndex(nextIndex);
      return currentQueue;
    });
  }, [currentIndex]); // Depend on currentIndex so we increment correctly

  useEffect(() => {
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
      // CASE 1: Explicit Duration Set (Applies to Image AND Video)
      timeToStay = currentItem.duration * 1000; 
    } else {
      // CASE 2: No Duration Set (Auto)
      if (!isVideo) {
        timeToStay = 3000; // Default Image: 3 seconds
      } else {
        timeToStay = 0; // Default Video: Wait for onEnd
      }
    }

    console.log(`Item ${currentIndex}: ${isVideo ? 'Video' : 'Image'} (${timeToStay > 0 ? timeToStay + 'ms' : 'Full Length'})`);

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
    
    // Unique key ensures component remounts on every loop/change
    const uniqueKey = `${currentMedia.id}-${playbackKey}`;

    if (currentMedia.file_type.includes('image')) {
      return (
        <Image
          key={uniqueKey}
          source={{ uri: currentMedia.file_path }}
          style={styles.media}
          resizeMode="contain"
        />
      );
    }

    if (currentMedia.file_type.includes('video')) {
      // Loop internally ONLY if a custom duration is set (forcing a cut-off)
      // Otherwise (Auto mode), play once then trigger onEnd to advance
      const shouldLoopInternally = !!currentItem.duration;

      return (
        <>
          <Video
            key={uniqueKey}
            source={{ uri: currentMedia.file_path }}
            style={styles.media}
            resizeMode="contain"
            muted={false}
            repeat={shouldLoopInternally} 
            onEnd={() => {
              // Only advance if we are in "Auto" mode (no duration set)
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
            ? "Content is assigned but not currently scheduled to play." 
            : "No content assigned to this screen."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderCurrentMedia()}
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
});

export default PlayerScreen;