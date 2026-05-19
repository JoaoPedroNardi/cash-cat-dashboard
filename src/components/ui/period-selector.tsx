import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PeriodType = 'all' | '12months' | 'year' | 'specific';

interface PeriodSelectorProps {
  period: PeriodType;
  selectedMonth: Date | null;
  onPeriodChange: (period: PeriodType) => void;
  onMonthChange: (date: Date) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  period,
  selectedMonth,
  onPeriodChange,
  onMonthChange,
}) => {
  const handlePeriodChange = (value: string) => {
    onPeriodChange(value as PeriodType);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [year, month] = e.target.value.split('-');
    onMonthChange(new Date(parseInt(year), parseInt(month) - 1, 1));
  };

  const getDisplayText = () => {
    if (period === 'specific' && selectedMonth) {
      return format(selectedMonth, 'MMMM yyyy', { locale: ptBR });
    }
    const labels: Record<PeriodType, string> = {
      all: 'Todos os meses',
      '12months': 'Últimos 12 meses',
      year: 'Este ano',
      specific: 'Mês específico',
    };
    return labels[period];
  };

  return (
    <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card mb-6">
      <div className="flex flex-col md:flex-row gap-6 items-end">
        {/* Período Selector */}
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-muted-foreground mb-3">
            Período
          </label>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-full border border-border bg-card rounded-xl">
              <SelectValue placeholder="Selecione um período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              <SelectItem value="12months">Últimos 12 meses</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
              <SelectItem value="specific">Mês específico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mês Input - Condicional */}
        {period === 'specific' && (
          <div className="flex-1 w-full animate-in fade-in duration-300">
            <label className="block text-sm font-medium text-muted-foreground mb-3">
              Selecione o mês
            </label>
            <input
              type="month"
              value={
                selectedMonth
                  ? format(selectedMonth, 'yyyy-MM')
                  : format(new Date(), 'yyyy-MM')
              }
              onChange={handleMonthChange}
              className="w-full px-4 py-2.5 border border-border bg-card rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>
        )}
      </div>

      {/* Status Text */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <p className="text-sm text-muted-foreground">
          Mostrando dados de:{' '}
          <span className="font-semibold text-foreground capitalize">
            {getDisplayText()}
          </span>
        </p>
      </div>
    </div>
  );
};