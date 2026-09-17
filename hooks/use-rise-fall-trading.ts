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
  const [lastCandleDirection, setLastCandleDirection] = useState<Direction | null>(null);
  const [candleEpoch, setCandleEpoch] = useState<number | null>(null);
  const [candleClose, setCandleClose] = useState<number | null>(null);
  const [candleOpen, setCandleOpen] = useState<number | null>(null);
  const candleRef = useRef<{ epoch: number; open: number; close: number } | null>(null);
  const previousClosedIds = useRef<Set<number>>(new Set());
  const previousStake = useRef<string>('10');
  const baseStake = useRef<string>('10');
  const lastAutoTradeEpoch = useRef<number | null>(null);

  useEffect(() => {
    if (!tradingWs || !tradingIsConnected || !activeSymbol) return;
    let active = true;
    const unsubscribe = tradingWs.onMessage((data) => {
      if (data.msg_type !== 'ohlc') return;
      const candle = data.ohlc as { epoch?: number; open?: number; close?: number } | undefined;
      if (!candle?.epoch || candle.open === undefined || candle.close === undefined) return;
      if (!active) return;
      const previous = candleRef.current;
      if (previous && previous.epoch !== candle.epoch) {
        setLastCandleDirection(previous.close >= previous.open ? 'CALL' : 'PUT');
      }
      candleRef.current = { epoch: candle.epoch, open: candle.open, close: candle.close };
      setCandleEpoch(candle.epoch);
      setCandleOpen(candle.open);
      setCandleClose(candle.close);
    });
    tradingWs.send({
      ticks_history: activeSymbol.underlying_symbol,
      style: 'candles',
      granularity: 60,
      count: 2,
      subscribe: 1,
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
      candleRef.current = null;
      tradingWs.send({ forget_all: 'ohlc' }).catch(() => {});
    };
  }, [tradingWs, tradingIsConnected, activeSymbol]);

  useEffect(() => {
    if (candleOpen === null || candleClose === null) return;
    setLastCandleDirection(candleClose >= candleOpen ? 'CALL' : 'PUT');
  }, [candleEpoch, candleOpen, candleClose]);

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
    if (!result) return;
    setSessionProfit(previous => {
      const next = previous + result;
      const target = Number(takeProfit);
      const limit = Number(stopLoss);
      if ((target > 0 && next >= target) || (limit > 0 && next <= -limit)) {
        setStrategyStopped(true);
      }
      return next;
    });
    if (martingale) {
      const loss = result < 0;
      const nextStake = loss
        ? Number(previousStake.current || baseStake.current) * 2
        : Number(baseStake.current);
      previousStake.current = String(nextStake);
      setStake(nextStake.toFixed(2));
    }
  }, [autoStrategy, strategyStopped, openPositions, takeProfit, stopLoss, martingale, stake]);

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

    const base = {
      contractType: allowEquals ? `${direction}E` : direction,
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      basis: 'stake' as const,
      currency: 'USD',
    };

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
  }, [activeSymbol, direction, allowEquals, stake, duration, durationUnit, endDate, endTime, isBuying, durationOptions, durationOptionsSymbol]);

  const { proposal } = useProposal(tradingWs, tradingIsConnected, proposalParams);

  useEffect(() => {
    if (!autoStrategy || strategyStopped || !isAuthenticated || !proposal || !candleEpoch || isBuying) return;
    if (lastAutoTradeEpoch.current === candleEpoch || openPositions.length > 0) return;
    lastAutoTradeEpoch.current = candleEpoch;
    void buyWithProposal(proposal);
  }, [autoStrategy, strategyStopped, isAuthenticated, proposal, candleEpoch, isBuying, openPositions.length, buyWithProposal]);

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
  };
}
