import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, BookOpen, ArrowUpDown, Settings as SettingsIcon } from 'lucide-react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { ReaderSettings } from '../types';
import { THEMES } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  Reader: { doc: any };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  settings: ReaderSettings;
  onUpdateSettings: (s: Partial<ReaderSettings>) => void;
}

const MainTabsNavigator: React.FC<RootNavigatorProps> = ({ settings, onUpdateSettings }) => {
  const theme = THEMES[settings.theme];
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 6);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      >
        {(props) => <HomeScreen {...props} settings={settings} />}
      </Tab.Screen>

      <Tab.Screen
        name="Library"
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
      >
        {(props) => <LibraryScreen {...props} settings={settings} />}
      </Tab.Screen>

      <Tab.Screen
        name="Activity"
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({ color, size }) => <ArrowUpDown size={size} color={color} />,
        }}
      >
        {(props) => <ActivityScreen {...props} settings={settings} />}
      </Tab.Screen>

      <Tab.Screen
        name="Settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
        }}
      >
        {(props) => <SettingsScreen {...props} settings={settings} onUpdateSettings={onUpdateSettings} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC<RootNavigatorProps> = ({ settings, onUpdateSettings }) => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs">
        {() => <MainTabsNavigator settings={settings} onUpdateSettings={onUpdateSettings} />}
      </Stack.Screen>

      <Stack.Screen
        name="Reader"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      >
        {(props) => (
          <ReaderScreen
            {...props}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
};
