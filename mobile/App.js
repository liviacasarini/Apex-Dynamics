import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View, StyleSheet, Animated, TouchableOpacity } from 'react-native';

import { AppProvider, useApp, COLORS } from './src/context/AppContext';
import PairingScreen from './src/screens/PairingScreen';
import WaitingAssignmentScreen from './src/screens/WaitingAssignmentScreen';
import HomeScreen from './src/screens/HomeScreen';
import TemperatureScreen from './src/screens/TemperatureScreen';
import PressuresScreen from './src/screens/PressuresScreen';
import TimerScreen from './src/screens/TimerScreen';
import ChatScreen from './src/screens/ChatScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_CONFIG = {
  Home:        { icon: '⌂', label: 'Início' },
  Temperature: { icon: '◉', label: 'Condições' },
  Pressures:   { icon: '◎', label: 'Pressões' },
  Timer:       { icon: '◷', label: 'Timer' },
  Chat:        { icon: '◈', label: 'Chat' },
};

function TabIcon({ route, focused }) {
  const { unreadCount } = useApp();
  const cfg = TAB_CONFIG[route.name];
  const color = focused ? COLORS.accent : COLORS.textMuted;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, color, fontWeight: focused ? '900' : '400' }}>
        {cfg.icon}
      </Text>
      {route.name === 'Chat' && unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabel: TAB_CONFIG[route.name]?.label || route.name,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
        tabBarIcon: ({ focused }) => <TabIcon route={route} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Temperature" component={TemperatureScreen} />
      <Tab.Screen name="Pressures" component={PressuresScreen} />
      <Tab.Screen name="Timer" component={TimerScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { connected, connecting, assignedProfiles } = useApp();

  // Não conectado → tela de pareamento
  if (!connected && !connecting) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Pairing" component={PairingScreen} />
      </Stack.Navigator>
    );
  }

  // Conectado mas sem perfil atribuído → tela de espera
  if (!assignedProfiles || assignedProfiles.length === 0) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="WaitingAssignment" component={WaitingAssignmentScreen} />
      </Stack.Navigator>
    );
  }

  // Conectado e atribuído → app completo
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
}

function EmergencyOverlay() {
  const { emergencyAlert, dismissEmergency } = useApp();
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!emergencyAlert) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [emergencyAlert]);

  if (!emergencyAlert) return null;

  const bgColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(230, 57, 70, 0.95)', 'rgba(180, 20, 30, 0.95)'],
  });

  return (
    <Animated.View style={[emergencyStyles.overlay, { backgroundColor: bgColor }]}>
      <View style={emergencyStyles.content}>
        <Text style={emergencyStyles.icon}>🚨</Text>
        <Text style={emergencyStyles.title}>EMERGÊNCIA</Text>
        <View style={emergencyStyles.messageBorder}>
          <Text style={emergencyStyles.message}>{emergencyAlert.message}</Text>
        </View>
        <Text style={emergencyStyles.timestamp}>
          {emergencyAlert.timestamp
            ? new Date(emergencyAlert.timestamp).toLocaleTimeString('pt-BR')
            : ''}
        </Text>
        <TouchableOpacity style={emergencyStyles.dismissBtn} onPress={dismissEmergency}>
          <Text style={emergencyStyles.dismissBtnText}>ENTENDIDO — DISPENSAR ALERTA</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const emergencyStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999,
    elevation: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '88%',
    alignItems: 'center',
    padding: 30,
  },
  icon: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 6,
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  messageBorder: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: 24,
    width: '100%',
    marginBottom: 16,
  },
  message: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 30,
  },
  timestamp: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32,
  },
  dismissBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

const DarkTheme = {
  dark: true,
  colors: {
    primary: COLORS.accent,
    background: COLORS.bg,
    card: COLORS.bgCard,
    text: COLORS.textPrimary,
    border: COLORS.border,
    notification: COLORS.accent,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <View style={{ flex: 1 }}>
          <NavigationContainer theme={DarkTheme}>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
          <EmergencyOverlay />
        </View>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
