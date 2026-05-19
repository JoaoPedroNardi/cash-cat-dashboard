import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/hooks/use-auth'
import { useMonthlySummary } from '@/hooks/use-monthly-summary'
import { supabase } from '@/integrations/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/monthly-summary')({
  component: MonthlySummaryPage,
})

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function MonthlySummaryPage() {
  const { user } = useAuth()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [accountId, setAccountId] = useState('all')
  const { data, loading, load } = useMonthlySummary()

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id)
      return data || []
    },
    enabled: !!user,
  })

  useEffect(() => {
    load(month, year, accountId === 'all' ? undefined : accountId)
  }, [month, year, accountId, load])

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1))
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1))

  if (loading && !data) return <div className="p-6">Carregando...</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Resumo</h2>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-center items-center gap-4">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold min-w-[150px] text-center">{MONTHS[month]} {year}</span>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Receitas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">R$ {data.totalIncome.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">R$ {data.totalExpenses.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Saldo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${data.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>R$ {data.balance.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Categorias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.breakdown.length === 0 ? (
                <p className="text-muted-foreground">Sem gastos</p>
              ) : (
                data.breakdown.map((item) => (
                  <div key={item.category}>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>{item.category}</span>
                      <span>R$ {item.totalExpenses.toFixed(2)} ({item.percentage}%)</span>
                    </div>
                    <Progress value={item.percentage} className="h-2" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {data.activeInstallments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Parcelamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.activeInstallments.map((inst, i) => (
                  <div key={i} className="text-sm border-b pb-2">
                    <p className="font-medium">{inst.description}</p>
                    <p className="text-muted-foreground">R$ {inst.remainingAmount.toFixed(2)} restantes</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}