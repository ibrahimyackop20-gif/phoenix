import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

const TabTrigger = NativeTabs.Trigger as typeof NativeTabs.Trigger & {
  Label: React.ComponentType<{ children: React.ReactNode }>;
  Icon: React.ComponentType<{ src: number; renderingMode?: string }>;
};

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <TabTrigger name="index">
        <TabTrigger.Label>Home</TabTrigger.Label>
        <TabTrigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </TabTrigger>

      <TabTrigger name="explore">
        <TabTrigger.Label>Explore</TabTrigger.Label>
        <TabTrigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </TabTrigger>
    </NativeTabs>
  );
}
