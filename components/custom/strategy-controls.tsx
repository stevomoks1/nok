'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
}: StrategyControlsProps) {
  return (
    <div className="space-y-2 rounded-md border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-strategy" className="cursor-pointer text-sm">Auto candle strategy</Label>
        <Switch id="auto-strategy" checked={autoStrategy} onCheckedChange={onAutoStrategyChange} />
      </div>
      {autoStrategy && (
        <>
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-martingale" className="cursor-pointer text-sm">Automatic martingale</Label>
            <Switch id="auto-martingale" checked={martingale} onCheckedChange={onMartingaleChange} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="take-profit" className="text-xs text-muted-foreground">Take profit</Label>
              <Input id="take-profit" type="number" min="0" step="0.01" value={takeProfit} onChange={event => onTakeProfitChange(event.target.value)} labelRight="USD" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stop-loss" className="text-xs text-muted-foreground">Stop loss</Label>
              <Input id="stop-loss" type="number" min="0" step="0.01" value={stopLoss} onChange={event => onStopLossChange(event.target.value)} labelRight="USD" />
            </div>
          </div>
          <p className={`text-xs ${strategyStopped ? 'text-destructive' : 'text-muted-foreground'}`}>
            Session P/L: {sessionProfit.toFixed(2)} USD{strategyStopped ? ' · limit reached' : ''}
          </p>
        </>
      )}
    </div>
  );
}