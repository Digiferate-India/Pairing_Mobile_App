# PlayerApp

A React Native digital signage player application that displays scheduled media content (images and videos) on connected devices. The app pairs with a CMS dashboard via pairing codes and automatically fetches and plays playlists based on scheduled times.

## 🎯 Features

- **Device Pairing**: Pair devices with a CMS dashboard using unique pairing codes
- **Dynamic Playlist Management**: Automatically fetches and updates playlists from Supabase backend
- **Scheduled Content**: Supports time-based scheduling for media items
- **Media Playback**: Plays images and videos with automatic transitions
- **Orientation Control**: Supports landscape, portrait, and auto orientation modes
- **Real-time Updates**: Polls for playlist changes every 4 seconds
- **Persistent Pairing**: Remembers paired screen ID across app restarts
- **Error Handling**: Graceful error handling with automatic retry for network issues

## 📱 Supported Platforms

- Android
- iOS

## 🛠️ Technology Stack

- **React Native** (0.82.0) - Cross-platform mobile framework
- **TypeScript** - Type-safe JavaScript
- **Supabase** - Backend database and API
- **React Native Video** - Video playback component
- **React Native Orientation Locker** - Screen orientation management
- **AsyncStorage** - Local data persistence

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 20 (as specified in package.json)
- **npm** or **yarn** package manager
- **React Native development environment** set up:
  - For Android: Android Studio, JDK, Android SDK
  - For iOS: Xcode, CocoaPods (macOS only)
- **Supabase account** with configured database and RPC functions:
  - `pair_screen(code_to_check)` - Pairs device with CMS dashboard
  - `get_screen_status(screen_id_to_check)` - Checks screen pairing status
  - `get_playlist_for_screen(screen_id_to_check)` - Fetches playlist for a screen

## 🚀 Installation

1. **Clone the repository** (if applicable):
   ```bash
   git clone <repository-url>
   cd PlayerApp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure Supabase**:
   - Open `src/lib/supabaseClient.js`
   - Update `supabaseUrl` and `supabaseAnonKey` with your Supabase project credentials

4. **iOS Setup** (macOS only):
   ```bash
   cd ios
   bundle install
   bundle exec pod install
   cd ..
   ```

## 🏃 Running the App

### Start Metro Bundler

```bash
npm start
# or
yarn start
```

### Run on Android

```bash
npm run android
# or
yarn android
```

### Run on iOS

```bash
npm run ios
# or
yarn ios
```

## 🔧 Configuration

### Supabase Setup

The app requires the following Supabase database functions to be set up:

1. **`pair_screen(code_to_check)`**:
   - Takes a pairing code as input
   - Updates screen status to 'paired' and returns screen details

2. **`get_screen_status(screen_id_to_check)`**:
   - Returns the current pairing status of a screen
   - Should return 'paired' if device is paired

3. **`get_playlist_for_screen(screen_id_to_check)`**:
   - Returns playlist items with media details
   - Each item should include: `item_id`, `duration`, `scheduled_time`, `file_name`, `file_path`, `file_type`, `orientation`

### Database Schema Expectations

The app expects the following data structure:

- **Screens table**: Contains screen information with pairing codes
- **Playlist items table**: Contains media items with:
  - Duration (in seconds)
  - Scheduled time (HH:mm format or null)
  - Media files with file paths
  - Orientation setting (landscape/portrait/auto)

## 📖 Usage

### Pairing a Device

1. Launch the app on your device
2. Enter the pairing code displayed on your CMS dashboard
3. Tap "Pair Device"
4. Once paired, the device will automatically fetch and display content

### Content Playback

- The app automatically plays media items in sequence
- Items with scheduled times only play at their designated times
- Images and videos transition automatically based on duration settings
- Orientation changes automatically based on media settings

### Exiting Pairing

To unpair a device, the screen status in Supabase must be changed from 'paired' to another status. The app will automatically exit the player view and return to the pairing screen.

## 📁 Project Structure

```
PlayerApp/
├── src/
│   ├── lib/
│   │   └── supabaseClient.js      # Supabase configuration
│   └── screens/
│       ├── PairingScreen.tsx      # Device pairing interface
│       └── PlayerScreen.tsx       # Main media player
├── android/                        # Android native code
├── ios/                            # iOS native code
├── App.tsx                         # Main app entry point
├── package.json                    # Dependencies and scripts
└── README.md                       # This file
```

## 🔑 Key Features Explained

### Polling Mechanism

The app polls Supabase every 4 seconds to:
- Check if the screen is still paired
- Fetch updated playlist data
- Handle network errors gracefully

### Scheduler

A 1-second interval scheduler:
- Checks for scheduled items that should play at the current time
- Manages media duration and transitions
- Handles items waiting for scheduled times

### Orientation Management

- Automatically locks orientation based on media settings
- Supports landscape, portrait, and auto modes
- Changes orientation when switching between items with different orientation requirements

## 🐛 Troubleshooting

### App won't pair

- Verify Supabase credentials are correct in `supabaseClient.js`
- Check that the `pair_screen` RPC function exists and is working
- Ensure the pairing code is valid and matches the format expected by your CMS

### Media not playing

- Check that media file paths are accessible (public URLs or signed URLs from Supabase Storage)
- Verify network connectivity
- Check that playlist items have valid durations and file paths

### Orientation not working

- Ensure `react-native-orientation-locker` is properly linked
- For iOS, check that device orientation permissions are set
- Restart the app after making orientation-related changes

### Build errors

- **Android**: Run `cd android && ./gradlew clean`
- **iOS**: Run `cd ios && bundle exec pod install`
- Clear Metro cache: `npm start -- --reset-cache`

## 🧪 Testing

Run the test suite:

```bash
npm test
# or
yarn test
```

## 📝 Scripts

- `npm start` - Start Metro bundler
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator
- `npm test` - Run tests
- `npm run lint` - Run ESLint



## 👥 Authors

Tanishq Pratap

## 🙏 Acknowledgments

- React Native community
- Supabase for backend infrastructure
- All contributors and maintainers
