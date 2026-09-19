'use client';

import { createContext, useContext } from 'react';
import { useRiseFallTrading } from '@/hooks/use-rise-fall-trading';
import type { UseRiseFallTradingReturn } from '@/hooks/use-rise-fall-trading';
import { useDerivWSContext } from './deriv-ws-provider';

const TradingContext = createContext<UseRiseFallTradingReturn | null>(null);

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const trading = useRiseFallTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: !!auth.wsUrl,
    onAuthWSFailed: auth.logout,
  });

  return (
    <TradingContext.Provider value={trading}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading(): UseRiseFallTradingReturn {
  const trading = useContext(TradingContext);
  if (!trading) throw new Error('useTrading must be used within a TradingProvider');
  return trading;
}