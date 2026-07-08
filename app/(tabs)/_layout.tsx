import { Redirect, Tabs } from "expo-router";
import { Bell, Boxes, Gauge, Globe2, Settings } from "lucide-react-native";

import { colors } from "@/constants/theme";
import { useSettingsStore } from "@/store/settingsStore";

export default function TabsLayout() {
  const backendConfig = useSettingsStore((state) => state.backendConfig);

  if (!backendConfig) {
    return <Redirect href="/connect" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.panelHeader,
          borderTopColor: colors.border,
          minHeight: 62,
          paddingTop: 6
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800"
        }
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Gauge color={color} size={20} strokeWidth={2.2} />
        }}
      />
      <Tabs.Screen
        name="containers"
        options={{
          title: "Containers",
          tabBarIcon: ({ color }) => <Boxes color={color} size={20} strokeWidth={2.2} />
        }}
      />
      <Tabs.Screen
        name="domains"
        options={{
          title: "Domains",
          tabBarIcon: ({ color }) => <Globe2 color={color} size={20} strokeWidth={2.2} />
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => <Bell color={color} size={20} strokeWidth={2.2} />
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Settings color={color} size={20} strokeWidth={2.2} />
        }}
      />
    </Tabs>
  );
}
