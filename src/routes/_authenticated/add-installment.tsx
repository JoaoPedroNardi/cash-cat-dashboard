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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Notebook" />
            </div>

            <div className="space-y-2">
              <Label>Valor Total</Label>
              <Input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Parcelas</Label>
              <Input type="number" min="2" max="48" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>

            {totalAmount && count && <p className="text-sm text-muted-foreground">R$ {(parseFloat(totalAmount) / parseInt(count)).toFixed(2)} por parcela</p>}

            <div className="space-y-2">
              <Label>Data Primeira Parcela</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Criando...' : 'Criar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}