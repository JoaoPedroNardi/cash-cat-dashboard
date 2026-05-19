import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EXPENSE_CATEGORIES } from '@/lib/categories'
import { useInstallments } from '@/hooks/use-installments'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/integrations/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/add-installment')({
  component: AddInstallmentPage,
})

function AddInstallmentPage() {
  const { user } = useAuth()
  const { addInstallments, loading } = useInstallments()
  const [description, setDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [count, setCount] = useState('2')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState('')
  const [accountId, setAccountId] = useState('')

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id)
      return data || []
    },
    enabled: !!user,
  })

  const handleSubmit = async () => {
    if (!description || !totalAmount || !count || !startDate || !category || !accountId) {
      toast.error('Preencha todos os campos')
      return
    }

    const result = await addInstallments({
      description,
      totalAmount: parseFloat(totalAmount),
      installmentCount: parseInt(count),
      startDate,
      category,
      accountId,
    })

    if (result.success) {
      toast.success('Parcelamento criado!')
      setDescription('')
      setTotalAmount('')
      setCount('2')
      setCategory('')
      setAccountId('')
    } else {
      toast.error(result.error || 'Erro')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Adicionar Parcelamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Notebook" />
            </div>

            <div className="space-y-2">
              <Label>Valor Total (R$)</Label>
              <Input type="number" step="0.01" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Número de parcelas</Label>
              <Input type="number" min="2" max="48" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>

            {totalAmount && count && parseInt(count) >= 2 && (
              <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm">
                <span className="text-muted-foreground">Valor por parcela: </span>
                <span className="font-semibold text-primary">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(totalAmount) / parseInt(count))}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Data da primeira parcela</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full bg-gradient-primary text-primary-foreground shadow-glow">
              {loading ? "Criando parcelas..." : "Criar parcelamento"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}