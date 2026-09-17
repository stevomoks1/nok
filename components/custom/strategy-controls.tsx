'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CANDLE_TIMEFRAMES } from '@/lib/candle-strategy';
import type { StrategyMetrics } from '@/lib/candle-strategy';

interface StrategyControlsProps {
  autoStrategy: boolean;
  onAutoStrategyChange: (value: boolean) => void;
  martingale: boolean;
  onMartingaleChange: (value: boolean) => void;
  takeProfit: string;
  onTakeProfitChange: (value: string) => void;
  stopLoss: string;
  onStopLossChange: (value: string) => void;
  sessionProfit: number;
  strategyStopped: boolean;
  candleTimeframe: number;
  onCandleTimeframeChange: (value: number) => void;
  martingaleMultiplier: string;
  onMartingaleMultiplierChange: (value: string) => void;
  strategyMetrics: StrategyMetrics;
}

export function StrategyControls({
  autoStrategy,
  onAutoStrategyChange,
  martingale,
  onMartingaleChange,
  takeProfit,
  onTakeProfitChange,
  stopLoss,
  onStopLossChange,
  sessionProfit,
  strategyStopped,
  candleTimeframe,
  onCandleTimeframeChange,
  martingaleMultiplier,
  onMartingaleMultiplierChange,
  strategyMetrics,
}: StrategyControlsProps) {
  return (
    <div className="space-y-2 rounded-md border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-strategy" className="cursor-pointer text-sm">Auto candle strategy</Label>
        <Switch id="auto-strategy" checked={autoStrategy} onCheckedChange={onAutoStrategyChange} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-martingale" className="cursor-pointer text-sm">Automatic martingale</Label>
        <Switch id="auto-martingale" checked={martingale} onCheckedChange={onMartingaleChange} disabled={autoStrategy} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Candle timeframe and expiry</Label>
        <Select value={String(candleTimeframe)} onValueChange={value => onCandleTimeframeChange(Number(value))} disabled={autoStrategy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CANDLE_TIMEFRAMES.map(option => (
              <SelectItem key={option.seconds} value={String(option.seconds)}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="take-profit" className="text-xs text-muted-foreground">Take profit</Label>
          <Input id="take-profit" type="number" min="0" step="0.01" value={takeProfit} onChange={event => onTakeProfitChange(event.target.value)} disabled={autoStrategy} labelRight="USD" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stop-loss" className="text-xs text-muted-foreground">Stop loss</Label>
          <Input id="stop-loss" type="number" min="0" step="0.01" value={stopLoss} onChange={event => onStopLossChange(event.target.value)} disabled={autoStrategy} labelRight="USD" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="martingale-multiplier" className="text-xs text-muted-foreground">Martingale multiplier</Label>
          <Input id="martingale-multiplier" type="number" min="1" step="0.1" value={martingaleMultiplier} onChange={event => onMartingaleMultiplierChange(event.target.value)} disabled={autoStrategy} />
        </div>
      </div>
      <p className={`text-xs ${strategyStopped ? 'text-destructive' : 'text-muted-foreground'}`}>
        {autoStrategy ? `Session P/L: ${sessionProfit.toFixed(2)} USD${strategyStopped ? ' · limit reached' : ''}` : 'Configure the strategy before starting it.'}
      </p>
      {autoStrategy && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Trades: {strategyMetrics.totalTrades}</span>
          <span>Win rate: {strategyMetrics.winRate.toFixed(1)}%</span>
          <span>Max drawdown: {strategyMetrics.maxDrawdown.toFixed(2)} USD</span>
          <span>Avg loss streak: {strategyMetrics.averageLossStreak.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}