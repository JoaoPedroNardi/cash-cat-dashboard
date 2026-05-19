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
    <div className="flex flex-col gap-4 mb-6 bg-white p-4 rounded-lg shadow">
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Período
          </label>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger>
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

        {period === 'specific' && (
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600">
        Mostrando dados de: <span className="font-semibold">{getDisplayText()}</span>
      </div>
    </div>
  );
};