'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useProposal, useBuy } from '@deriv/core';
import type {
  DerivWS,
  ActiveSymbol,
  Tick,
  ProposalInfo,
  ProposalParams,
  BuyResult,
} from '@deriv/core';
import { useBaseTrading } from '@/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/hooks/use-base-trading';
import { useAppTranslations } from '@/components/custom/i18n-provider';
import type { Direction, DurationSelectUnit, DurationOption, OpenPosition, ClosedPosition } from '../lib/types';
import { getDurationOptions, getDurationUnitLabels, computeEndTimeEpoch } from '@/lib/duration-utils';
import { CANDLE_TIMEFRAMES, type StrategyMetrics } from '@/lib/candle-strategy';

const CONTRACT_TYPES = ['CALL', 'PUT'];

interface UseRiseFallTradingReturn {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  prices: number[];
  pipSize: number;
  direction: Direction;
  setDirection: (direction: Direction) => void;
  allowEquals: boolean;
  setAllowEquals: (value: boolean) => void;
  stake: string;
  setStake: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationOptions: DurationOption[];
  durationUnit: DurationSelectUnit;
  setDurationUnit: (unit: DurationSelectUnit) => void;
  endDate: Date | undefined;
  setEndDate: (date: Date | undefined) => void;
  endTime: string;
  setEndTime: (time: string) => void;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
  autoStrategy: boolean;
  setAutoStrategy: (value: boolean) => void;
  martingale: boolean;
  setMartingale: (value: boolean) => void;
  takeProfit: string;
  setTakeProfit: (value: string) => void;
  stopLoss: string;
  setStopLoss: (value: string) => void;
  sessionProfit: number;
  strategyStopped: boolean;
  candleTimeframe: number;
  setCandleTimeframe: (value: number) => void;
  martingaleMultiplier: string;
  setMartingaleMultiplier: (value: string) => void;
  strategyMetrics: StrategyMetrics;
}

export type UseRiseFallTradingParams = Pick<UseBaseTradingParams, 'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed'>;

export function useRiseFallTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed }: UseRiseFallTradingParams): UseRiseFallTradingReturn {
  const { localize } = useAppTranslations();
  const {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    contracts,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  } = useBaseTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, contractTypes: CONTRACT_TYPES });

  const [direction, setDirection] = useState<Direction>('CALL');
  const [allowEquals, setAllowEquals] = useState<boolean>(false);
  const [stake, setStake] = useState<string>('10');
  const [duration, setDuration] = useState<number>(1);
  const [durationUnit, setDurationUnitRaw] = useState<DurationSelectUnit>('t');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<string>('');
  const [durationOptionsSymbol, setDurationOptionsSymbol] = useState<string | null>(null);
  const [autoStrategy, setAutoStrategy] = useState(false);
  const [martingale, setMartingale] = useState(false);
  const [takeProfit, setTakeProfit] = useState('0');
  const [stopLoss, setStopLoss] = useState('0');
  const [sessionProfit, setSessionProfit] = useState(0);
  const [strategyStopped, setStrategyStopped] = useState(false);
  const [candleTimeframe, setCandleTimeframe] = useState(60);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2');
  const [strategyMetrics, setStrategyMetrics] = useState<StrategyMetrics>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    maxDrawdown: 0,
    averageLossStreak: 0,
  });
  const [lastCandleDirection, setLastCandleDirection] = useState<Direction | null>(null);
  const [candleEpoch, setCandleEpoch] = useState<number | null>(null);
  const candleRef = useRef<{ openTime: number; open: number; close: number } | null>(null);
  const [autoSignal, setAutoSignal] = useState<{ epoch: number; direction: Direction; expiry: number } | null>(null);
  const previousClosedIds = useRef<Set<number>>(new Set());
  const previousStake = useRef<string>('10');
  const baseStake = useRef<string>('10');
  const lastAutoTradeEpoch = useRef<number | null>(null);
  const pendingEntryEpoch = useRef<number | null>(null);
  const peakProfit = useRef(0);
  const currentLossStreak = useRef(0);
  const lossStreakTotal = useRef(0);
  const lossStreakCount = useRef(0);

  useEffect(() => {
    if (!tradingWs || !tradingIsConnected || !activeSymbol) return;
    let active = true;
    const unsubscribe = tradingWs.onMessage((data) => {
      if (data.msg_type !== 'ohlc') return;
      const candle = data.ohlc as { open_time?: number; open?: number; close?: number } | undefined;
      if (!candle?.open_time || candle.open === undefined || candle.close === undefined) return;
      if (!active) return;
      const previous = candleRef.current;
      if (previous && previous.openTime !== candle.open_time) {
        const previousDirection = previous.close === previous.open
          ? null
          : previous.close > previous.open ? 'CALL' : 'PUT';
        setLastCandleDirection(previousDirection);
        setAutoSignal(previousDirection
          ? {
              epoch: candle.open_time,
              direction: previousDirection,
              expiry: candle.open_time + candleTimeframe,
            }
          : null);
        setCandleEpoch(candle.open_time);
        pendingEntryEpoch.current = previousDirection ? candle.open_time : null;
      }
      candleRef.current = { openTime: candle.open_time, open: candle.open, close: candle.close };
    });
    tradingWs.send({
      ticks_history: activeSymbol.underlying_symbol,
      style: 'candles',
      granularity: candleTimeframe,
      count: 2,
      subscribe: 1,
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
      candleRef.current = null;
      setAutoSignal(null);
      pendingEntryEpoch.current = null;
      tradingWs.send({ forget_all: 'ohlc' }).catch(() => {});
    };
  }, [tradingWs, tradingIsConnected, activeSymbol, candleTimeframe]);

  useEffect(() => {
    if (!autoStrategy || strategyStopped || !lastCandleDirection) return;
    setDirection(lastCandleDirection);
  }, [autoStrategy, strategyStopped, lastCandleDirection]);

  useEffect(() => {
    if (!autoStrategy || strategyStopped || !openPositions.length) return;
    const closed = openPositions.filter(position =>
      position.status !== 'open' && !previousClosedIds.current.has(position.contract_id)
    );
    if (!closed.length) return;
    closed.forEach(position => previousClosedIds.current.add(position.contract_id));
    const result = closed.reduce((total, position) => total + Number(position.profit || 0), 0);
    const wins = closed.filter(position => Number(position.profit || 0) > 0).length;
    const losses = closed.length - wins;
    closed.forEach(position => {
      if (Number(position.profit || 0) > 0) {
        if (currentLossStreak.current > 0) {
          lossStreakTotal.current += currentLossStreak.current;
          lossStreakCount.current += 1;
        }
        currentLossStreak.current = 0;
      } else {
        currentLossStreak.current += 1;
      }
    });
    setSessionProfit(previous => {
      const next = previous + result;
      peakProfit.current = Math.max(peakProfit.current, next);
      const target = Number(takeProfit);
      const limit = Number(stopLoss);
      if ((target > 0 && next >= target) || (limit > 0 && next <= -limit)) {
        setStrategyStopped(true);
      }
      return next;
    });
    setStrategyMetrics(previous => {
      const totalTrades = previous.totalTrades + closed.length;
      return {
        totalTrades,
        wins: previous.wins + wins,
        losses: previous.losses + losses,
        winRate: totalTrades ? ((previous.wins + wins) / totalTrades) * 100 : 0,
        maxDrawdown: Math.max(previous.maxDrawdown, peakProfit.current - sessionProfit - result),
        averageLossStreak: lossStreakCount.current
          ? lossStreakTotal.current / lossStreakCount.current
          : previous.averageLossStreak,
      };
    });
    if (martingale) {
      const loss = result < 0;
      const nextStake = loss
        ? Number(previousStake.current || baseStake.current) * Math.max(1, Number(martingaleMultiplier) || 1)
        : Number(baseStake.current);
      previousStake.current = String(nextStake);
      setStake(nextStake.toFixed(2));
    }
  }, [autoStrategy, strategyStopped, openPositions, takeProfit, stopLoss, martingale, martingaleMultiplier, stake, sessionProfit]);

  const durationOptions = useMemo(
    () => getDurationOptions(contracts, getDurationUnitLabels(localize)),
    [contracts, localize]
  );

  // Track durationUnit and activeSymbol in refs so the duration-options effect doesn't list them in deps
  const durationUnitRef = useRef(durationUnit);
  const activeSymbolKeyRef = useRef(activeSymbol?.underlying_symbol);

  useEffect(() => {
    durationUnitRef.current = durationUnit;
  }, [durationUnit]);

  useEffect(() => {
    activeSymbolKeyRef.current = activeSymbol?.underlying_symbol;
  }, [activeSymbol?.underlying_symbol]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset duration/end-time state when contracts-derived options change */
  useEffect(() => {
    if (!durationOptions.length) return;
    setEndDate(undefined);
    setEndTime('');
    setDurationOptionsSymbol(activeSymbolKeyRef.current ?? null);
    const currentOpt = durationOptions.find(o => o.unit === durationUnitRef.current);
    if (!currentOpt) {
      const first = durationOptions[0];
      setDurationUnitRaw(first.unit);
      if (first.unit !== 'end-time') setDuration(first.min);
    } else if (currentOpt.unit !== 'end-time') {
      setDuration(prev => (prev < currentOpt.min || prev > currentOpt.max) ? currentOpt.min : prev);
    }
  }, [durationOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setDurationUnit = useCallback((unit: DurationSelectUnit) => {
    setDurationUnitRaw(unit);
    const opt = durationOptions.find(o => o.unit === unit);
    if (opt && unit !== 'end-time') setDuration(opt.min);
  }, [durationOptions]);

  const { buyContract: buyWithProposal, isBuying, buyResult, buyError, clearBuyResult } =
    useBuy(tradingWs, tradingIsConnected);

  const proposalParams: ProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol || !durationOptions.length) return null;
    if (durationOptionsSymbol !== activeSymbol.underlying_symbol) return null;
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;

    const strategyDirection = autoStrategy && autoSignal ? autoSignal.direction : direction;
    const base = {
      contractType: allowEquals ? `${strategyDirection}E` : strategyDirection,
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      basis: 'stake' as const,
      currency: 'USD',
    };

    if (autoStrategy) {
      if (!autoSignal) return null;
      return { ...base, duration: 0, durationUnit: 'd', dateExpiry: autoSignal.expiry };
    }

    if (durationUnit === 'end-time') {
      const dateExpiry = computeEndTimeEpoch(endDate, endTime);
      if (!dateExpiry) return null;
      return { ...base, duration: 0, durationUnit: 'd', dateExpiry };
    }

    const opt = durationOptions.find(o => o.unit === durationUnit);
    if (!opt || duration < opt.min || duration > opt.max) return null;

    if (durationUnit === 'h') {
      return { ...base, duration: duration * 60, durationUnit: 'm' };
    }

    return { ...base, duration, durationUnit };
  }, [activeSymbol, direction, allowEquals, stake, duration, durationUnit, endDate, endTime, isBuying, durationOptions, durationOptionsSymbol, autoStrategy, autoSignal, candleTimeframe]);

  const { proposal } = useProposal(tradingWs, tradingIsConnected, proposalParams);

  useEffect(() => {
    if (!autoStrategy || strategyStopped || !isAuthenticated || !proposal || !candleEpoch || isBuying) return;
    if (!autoSignal || autoSignal.epoch !== candleEpoch) return;
    if (pendingEntryEpoch.current !== candleEpoch) return;
    const expectedContractType = allowEquals ? `${autoSignal.direction}E` : autoSignal.direction;
    if (proposal.contractType !== expectedContractType || proposal.dateExpiry !== autoSignal.expiry) return;
    if (lastAutoTradeEpoch.current === candleEpoch || openPositions.length > 0) return;
    lastAutoTradeEpoch.current = candleEpoch;
    pendingEntryEpoch.current = null;
    void buyWithProposal(proposal);
  }, [autoStrategy, strategyStopped, isAuthenticated, proposal, candleEpoch, autoSignal, allowEquals, candleTimeframe, isBuying, openPositions.length, buyWithProposal]);

  const buyContract = useCallback(async () => {
    if (proposal && (!autoStrategy || !strategyStopped)) await buyWithProposal(proposal);
  }, [proposal, buyWithProposal, autoStrategy, strategyStopped]);

  return {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    direction,
    setDirection,
    allowEquals,
    setAllowEquals,
    stake,
    setStake,
    duration,
    setDuration,
    durationOptions,
    durationUnit,
    setDurationUnit,
    endDate,
    setEndDate,
    endTime,
    setEndTime,
    proposal,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
    autoStrategy,
    setAutoStrategy: (value: boolean) => {
      setAutoStrategy(value);
      if (value) {
        baseStake.current = stake;
        previousStake.current = stake;
        setStrategyStopped(false);
        setSessionProfit(0);
        previousClosedIds.current.clear();
        setAutoSignal(null);
        peakProfit.current = 0;
        currentLossStreak.current = 0;
        lossStreakTotal.current = 0;
        lossStreakCount.current = 0;
        setStrategyMetrics({ totalTrades: 0, wins: 0, losses: 0, winRate: 0, maxDrawdown: 0, averageLossStreak: 0 });
      }
    },
    martingale,
    setMartingale,
    takeProfit,
    setTakeProfit,
    stopLoss,
    setStopLoss,
    sessionProfit,
    strategyStopped,
    candleTimeframe,
    setCandleTimeframe: value => {
      if (CANDLE_TIMEFRAMES.some(option => option.seconds === value)) setCandleTimeframe(value);
    },
    martingaleMultiplier,
    setMartingaleMultiplier,
    strategyMetrics,
  };
}
