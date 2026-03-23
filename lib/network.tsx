/**
 * Global Network State Manager
 * Monitors network connectivity and provides offline/online state
 */

import * as React from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NetworkContextType {
  isOnline: boolean;
  isConnected: boolean;
  connectionType: string;
  showOfflineBanner: boolean;
  dismissOfflineBanner: () => void;
}

const NetworkContext = React.createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [isConnected, setIsConnected] = React.useState(true);
  const [connectionType, setConnectionType] = React.useState('wifi');
  const [showOfflineBanner, setShowOfflineBanner] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      const connected = state.isConnected ?? true;

      setIsOnline(online);
      setIsConnected(connected);
      setConnectionType(state.type);

      if (!online) {
        setShowOfflineBanner(true);
      } else {
        // Auto-dismiss when connectivity is restored
        setShowOfflineBanner(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const dismissOfflineBanner = () => {
    setShowOfflineBanner(false);
  };

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isConnected,
        connectionType,
        showOfflineBanner,
        dismissOfflineBanner,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = React.useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

// Standalone function for checking connectivity
export async function checkConnectivity(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}
