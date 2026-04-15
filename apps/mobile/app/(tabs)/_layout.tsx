import { View } from 'react-native';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import { House, Newspaper, Plus, ChartBar, UserCircle } from 'phosphor-react-native';

import { colors } from '@/constants/colors';

const TAB_BAR_STYLE = {
  backgroundColor: colors.surface,
  borderTopColor: colors.border,
  height: 80,
  paddingBottom: 20,
  paddingTop: 8,
} as const;

/** Rooms list only; stack sub-routes hide the tab bar for focused flows. */
const ROOMS_TAB_LIST_ROUTE = 'index';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: TAB_BAR_STYLE,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="rooms"
        options={({ route }) => {
          const focusedRoute = getFocusedRouteNameFromRoute(route) ?? ROOMS_TAB_LIST_ROUTE;
          const hideTabBar = focusedRoute !== ROOMS_TAB_LIST_ROUTE;
          return {
            title: 'Rooms',
            tabBarStyle: hideTabBar ? { display: 'none' } : TAB_BAR_STYLE,
            tabBarIcon: ({ color, focused }) => (
              <House size={24} color={color} weight={focused ? 'fill' : 'regular'} />
            ),
          };
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, focused }) => (
            <Newspaper size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="bet"
        options={{
          title: 'Bet',
          tabBarIcon: () => (
            <View className="-mt-4 h-14 w-14 items-center justify-center rounded-full bg-primary">
              <Plus size={28} color="#fff" weight="bold" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <ChartBar size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <UserCircle size={24} color={color} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}
